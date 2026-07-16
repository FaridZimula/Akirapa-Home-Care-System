import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus, PodRole } from '@prisma/client';
import { createNotification } from '@/lib/notifications';

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
        message: `ALERT: Shift dropped by primary caregiver. You have been assigned to cover client ${shift.client.name} on ${shift.scheduledStart.toLocaleDateString()} at ${shift.scheduledStart.toLocaleTimeString()}. Please confirm availability before ${result.escalatedShift.confirmationDeadline.toLocaleTimeString()}.`,
      };

      // Write another audit log for the escalation
      await logAudit({
        userId: 'SYSTEM',
        action: 'ESCALATE_SHIFT',
        details: `Shift escalated and reassigned to backup caregiver ${result.backupCaregiverName} for client ${shift.client.name}. Mock SMS alert routed.`,
        outcome: 'SUCCESS',
      });

      // Notify Backup Caregiver via DB In-App Notification
      await createNotification({
        userId: result.escalatedShift.caregiverId,
        title: 'Urgent Shift Reassignment',
        message: `A shift for client ${shift.client.name} on ${shift.scheduledStart.toLocaleDateString()} was dropped. You have been assigned as backup. Please confirm by ${new Date(result.escalatedShift.confirmationDeadline).toLocaleTimeString()}.`,
        type: 'SHIFT_ASSIGNED',
      });

      // Notify Client's Family Members
      const familyMembers = await prisma.linkedFamilyMember.findMany({
        where: { clientId: shift.clientId },
      });
      for (const fam of familyMembers) {
        await createNotification({
          userId: fam.userId,
          title: 'Caregiver Update',
          message: `Your caregiver ${previousCaregiverName} dropped the scheduled shift for ${shift.client.name} on ${shift.scheduledStart.toLocaleDateString()}. Backup caregiver ${result.backupCaregiverName} has been assigned.`,
          type: 'SHIFT_DROPPED',
        });
      }
    } else {
      await logAudit({
        userId: 'SYSTEM',
        action: 'ESCALATE_ALERT_FAIL',
        details: `Shift dropped for client ${shift.client.name} but no backup caregiver was available in their pod. Agency admin notification triggered.`,
        outcome: 'FAILURE',
      });

      // Notify Admins & Coordinators about critical gap
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } },
      });
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          title: 'CRITICAL: Shift Dropped - No Backup',
          message: `Caregiver ${previousCaregiverName} dropped their shift for client ${shift.client.name} (Start: ${shift.scheduledStart.toLocaleString()}), and no backup caregiver is available in the pod.`,
          type: 'SYSTEM_ALERT',
        });
      }
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
