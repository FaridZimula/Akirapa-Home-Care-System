import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus, PodRole } from '@prisma/client';
import { formatDate, formatTime, formatDateTime } from '@/lib/dateFormat';
import { createNotification, notifyAdmins, notifyClientFamily, notifyCaregiver } from '@/lib/notifications';

export async function POST(request: Request) {
  try {
    const { shiftId, reason } = await request.json();

    if (!shiftId) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    // 1. Fetch current shift
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { client: true, caregiver: true },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.status === ShiftStatus.COMPLETED || shift.status === ShiftStatus.DROPPED) {
      return NextResponse.json({ error: 'Shift cannot be dropped in its current status' }, { status: 400 });
    }

    const previousCaregiverId = shift.caregiverId;
    const previousCaregiverName = shift.caregiver.name;

    // 2. Perform drop and escalation transaction
    const result = await prisma.$transaction(async (tx) => {
      // Mark current shift as dropped
      const droppedShift = await tx.shift.update({
        where: { id: shiftId },
        data: { status: ShiftStatus.DROPPED },
      });

      // Find caregiver pod for this client to locate backup
      const podAssignments = await tx.caregiverPod.findMany({
        where: { clientId: shift.clientId },
        include: { caregiver: true },
        orderBy: { role: 'asc' }, // PRIMARY, SECONDARY_1, SECONDARY_2
      });

      // Find secondary caregiver to escalate to
      const secondary1 = podAssignments.find(p => p.role === PodRole.SECONDARY_1);
      const secondary2 = podAssignments.find(p => p.role === PodRole.SECONDARY_2);

      let backupAssignment = null;
      if (secondary1 && secondary1.caregiverId !== previousCaregiverId) {
        backupAssignment = secondary1;
      } else if (secondary2 && secondary2.caregiverId !== previousCaregiverId) {
        backupAssignment = secondary2;
      }

      if (backupAssignment) {
        // Create new replacement shift for the backup caregiver
        const escalationDeadline = new Date(shift.scheduledStart.getTime() - 12 * 60 * 60 * 1000); // 12 hours confirmation window for backup

        const escalatedShift = await tx.shift.create({
          data: {
            clientId: shift.clientId,
            caregiverId: backupAssignment.caregiverId,
            status: ShiftStatus.UNCONFIRMED,
            scheduledStart: shift.scheduledStart,
            scheduledEnd: shift.scheduledEnd,
            confirmationDeadline: escalationDeadline,
          },
          include: {
            caregiver: true,
            client: true,
          },
        });

        return {
          success: true,
          escalated: true,
          droppedShift,
          escalatedShift,
          backupCaregiverId: backupAssignment.caregiverId,
          backupCaregiverName: backupAssignment.caregiver.name,
          backupPhoneNumber: backupAssignment.caregiver.phoneNumber,
        };
      }

      return {
        success: true,
        escalated: false,
        droppedShift,
        message: 'No backup caregiver registered in the client pod. Agency Alert generated.',
      };
    });

    // 3. Write audit log
    await logAudit({
      userId: previousCaregiverId,
      action: 'DROP_SHIFT',
      details: `Caregiver ${previousCaregiverName} dropped shift for client ${shift.client.name} (Start: ${shift.scheduledStart.toISOString()}). Reason: ${reason || 'Not specified'}.`,
      outcome: 'SUCCESS',
    });

    let smsAlertMock = null;
    if (result.escalated && result.escalatedShift) {
      // Create SMS alert mock payload
      smsAlertMock = {
        to: result.backupPhoneNumber || '+16045550000',
        message: `ALERT: Shift dropped by primary caregiver. You have been assigned to cover client ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}. Please confirm availability before ${formatTime(result.escalatedShift.confirmationDeadline)}.`,
      };

      // Write another audit log for the escalation
      await logAudit({
        userId: 'SYSTEM',
        action: 'ESCALATE_SHIFT',
        details: `Shift escalated and reassigned to backup caregiver ${result.backupCaregiverName} for client ${shift.client.name}. Mock SMS alert routed.`,
        outcome: 'SUCCESS',
      });

      // MULTI-PARTY NOTIFICATIONS:
      // (a) Notify Backup Caregiver
      await notifyCaregiver({
        caregiverId: result.backupCaregiverId!,
        title: '🚨 Urgent Shift Coverage Assignment',
        message: `You have been reassigned to cover client ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)} after the shift was dropped. Please confirm before ${formatDateTime(result.escalatedShift.confirmationDeadline)}.`,
        type: 'SHIFT_ASSIGNED',
      });

      // (b) Notify Client / Linked Family Members
      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Caregiver Update',
        message: `Caregiver ${previousCaregiverName} was unable to fulfill the visit on ${formatDate(shift.scheduledStart)}. Backup caregiver ${result.backupCaregiverName} has been assigned to cover ${shift.client.name}.`,
        type: 'SHIFT_DROPPED',
      });

      // (c) Notify Admins
      await notifyAdmins({
        title: 'Shift Dropped & Escalated',
        message: `Caregiver ${previousCaregiverName} dropped shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)} (Reason: ${reason || 'None provided'}). Auto-reassigned to backup caregiver ${result.backupCaregiverName}.`,
        type: 'SHIFT_DROPPED',
      });

      // (d) Confirm to Dropping Caregiver
      await notifyCaregiver({
        caregiverId: previousCaregiverId,
        title: 'Shift Drop Processed',
        message: `Your drop request for shift with ${shift.client.name} on ${formatDate(shift.scheduledStart)} has been processed and reassigned.`,
        type: 'SHIFT_DROPPED',
      });
    } else {
      await logAudit({
        userId: 'SYSTEM',
        action: 'ESCALATE_ALERT_FAIL',
        details: `Shift dropped for client ${shift.client.name} but no backup caregiver was available in their pod. Agency admin notification triggered.`,
        outcome: 'FAILURE',
      });

      // (a) Notify Admins (CRITICAL)
      await notifyAdmins({
        title: '🚨 CRITICAL: Shift Dropped - No Backup Available',
        message: `Caregiver ${previousCaregiverName} dropped shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)} (Reason: ${reason || 'None provided'}). NO backup caregiver was found in the pod. Manual coverage required immediately!`,
        type: 'SYSTEM_ALERT',
      });

      // (b) Notify Client / Family
      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Care Schedule Notice',
        message: `Caregiver ${previousCaregiverName} is unable to attend the visit on ${formatDate(shift.scheduledStart)}. Our care coordination team is actively working on securing replacement coverage for ${shift.client.name}.`,
        type: 'SHIFT_DROPPED',
      });

      // (c) Notify Dropping Caregiver
      await notifyCaregiver({
        caregiverId: previousCaregiverId,
        title: 'Shift Dropped (Uncovered)',
        message: `You dropped your shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)}. No automatic backup was available; please contact your coordinator immediately.`,
        type: 'SHIFT_DROPPED',
      });
    }

    return NextResponse.json({
      success: true,
      escalated: result.escalated,
      backupCaregiverName: result.escalated ? result.backupCaregiverName : null,
      smsAlertMock,
      message: result.escalated 
        ? `Shift dropped. Escalated to backup caregiver ${result.backupCaregiverName}.` 
        : `Shift dropped. No backup caregiver found in pod. Admin alert dispatched.`,
    });
  } catch (error) {
    console.error('Failed to drop/escalate shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
