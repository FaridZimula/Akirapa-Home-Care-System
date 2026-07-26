import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus, PodRole } from '@prisma/client';

export async function POST(request: Request) {
  try {
    // Allow the scheduled cron trigger (Bearer CRON_SECRET) or a logged-in admin/coordinator
    // clicking "Run Escalation Check" manually from the Business Hub.
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCronRequest = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

    if (!isCronRequest) {
      const sessionUser = await getSessionUser();
      if (!sessionUser || (sessionUser.role !== 'ADMIN' && sessionUser.role !== 'CARE_COORDINATOR')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const now = new Date();

    // 1. Find all UNCONFIRMED shifts where confirmationDeadline has passed
    const missedShifts = await prisma.shift.findMany({
      where: {
        status: ShiftStatus.UNCONFIRMED,
        confirmationDeadline: {
          lte: now,
        },
      },
      include: {
        client: true,
        caregiver: true,
      },
    });

    const adminUsers = missedShifts.length > 0
      ? await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } },
          select: { id: true },
        })
      : [];

    const escalations: any[] = [];

    for (const shift of missedShifts) {
      // Find backup caregivers in client's pod
      const podAssignments = await prisma.caregiverPod.findMany({
        where: { clientId: shift.clientId },
        include: { caregiver: true },
        orderBy: { role: 'asc' }, // PRIMARY, SECONDARY_1, SECONDARY_2
      });

      const secondary1 = podAssignments.find(p => p.role === PodRole.SECONDARY_1);
      const secondary2 = podAssignments.find(p => p.role === PodRole.SECONDARY_2);

      let backupAssignment = null;
      if (secondary1 && secondary1.caregiverId !== shift.caregiverId) {
        backupAssignment = secondary1;
      } else if (secondary2 && secondary2.caregiverId !== shift.caregiverId) {
        backupAssignment = secondary2;
      }

      if (backupAssignment) {
        // Reassign the shift to the backup caregiver
        const nextDeadline = new Date(shift.scheduledStart.getTime() - 12 * 60 * 60 * 1000); // 12 hours before

        await prisma.$transaction(async (tx) => {
          // Mark old shift as DROPPED or NO_SHOW (since they missed the deadline)
          await tx.shift.update({
            where: { id: shift.id },
            data: { status: ShiftStatus.NO_SHOW },
          });

          // Create new escalated shift for backup
          await tx.shift.create({
            data: {
              clientId: shift.clientId,
              caregiverId: backupAssignment!.caregiverId,
              status: ShiftStatus.UNCONFIRMED,
              scheduledStart: shift.scheduledStart,
              scheduledEnd: shift.scheduledEnd,
              confirmationDeadline: nextDeadline,
            },
          });
        });

        // Write Audit Logs
        await logAudit({
          userId: 'SYSTEM',
          action: 'AUTO_ESCALATION_TIMEOUT',
          details: `Primary caregiver ${shift.caregiver.name} failed to confirm shift for client ${shift.client.name} (Start: ${shift.scheduledStart.toISOString()}) before deadline ${shift.confirmationDeadline.toISOString()}.`,
          outcome: 'SUCCESS',
        });

        await logAudit({
          userId: 'SYSTEM',
          action: 'ESCALATE_SHIFT',
          details: `Shift auto-escalated and reassigned to backup caregiver ${backupAssignment.caregiver.name}.`,
          outcome: 'SUCCESS',
        });

        // Warn the caregiver who missed their confirmation deadline
        await createNotification({
          userId: shift.caregiverId,
          title: '⚠️ Missed Shift Confirmation',
          message: `You did not confirm your shift for ${shift.client.name} (${shift.scheduledStart.toLocaleDateString()}) before the 24-hour deadline. It has been reassigned to another caregiver. Repeated missed confirmations may affect your standing and future shift assignments.`,
          type: 'SHIFT_CONFIRMATION_MISSED',
        });

        // Notify the backup caregiver of their new assignment
        await createNotification({
          userId: backupAssignment.caregiverId,
          title: 'New Shift Assigned',
          message: `You've been assigned to cover client ${shift.client.name} on ${shift.scheduledStart.toLocaleDateString()} at ${shift.scheduledStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} after the primary caregiver missed their confirmation deadline. Please confirm before ${nextDeadline.toLocaleString()}.`,
          type: 'SHIFT_ASSIGNED',
        });

        // Surface the event to admins/coordinators
        await Promise.all(adminUsers.map(admin => createNotification({
          userId: admin.id,
          title: 'Shift Auto-Escalated',
          message: `${shift.caregiver.name} missed the confirmation deadline for ${shift.client.name}'s shift on ${shift.scheduledStart.toLocaleDateString()}. Auto-reassigned to backup caregiver ${backupAssignment!.caregiver.name}.`,
          type: 'SYSTEM_ALERT',
        })));

        escalations.push({
          clientId: shift.clientId,
          clientName: shift.client.name,
          missedCaregiver: shift.caregiver.name,
          backupCaregiver: backupAssignment.caregiver.name,
          smsAlertMock: {
            to: backupAssignment.caregiver.phoneNumber || '+16045550000',
            message: `AUTO-ALERT: Shift confirmation missed by primary caregiver. You have been assigned to cover client ${shift.client.name} on ${shift.scheduledStart.toLocaleDateString()}. Confirm before ${nextDeadline.toLocaleTimeString()}.`,
          },
        });
      } else {
        // No backup found, flag critical alert
        await logAudit({
          userId: 'SYSTEM',
          action: 'AUTO_ESCALATION_FAILED',
          details: `Primary caregiver ${shift.caregiver.name} failed to confirm shift for client ${shift.client.name} but no backup caregiver exists in their pod. CRITICAL ADMIN ALERT RAISED.`,
          outcome: 'FAILURE',
        });

        // Warn the caregiver who missed their confirmation deadline
        await createNotification({
          userId: shift.caregiverId,
          title: '⚠️ Missed Shift Confirmation',
          message: `You did not confirm your shift for ${shift.client.name} (${shift.scheduledStart.toLocaleDateString()}) before the 24-hour deadline. No backup caregiver was available to cover it. Contact your coordinator immediately - repeated missed confirmations may affect your standing and future shift assignments.`,
          type: 'SHIFT_CONFIRMATION_MISSED',
        });

        // Critical: no coverage found, admins/coordinators must intervene manually
        await Promise.all(adminUsers.map(admin => createNotification({
          userId: admin.id,
          title: '🚨 CRITICAL: Unfilled Shift',
          message: `${shift.caregiver.name} missed the confirmation deadline for ${shift.client.name}'s shift on ${shift.scheduledStart.toLocaleDateString()} and no backup caregiver was available in the pod. This shift needs manual coverage now.`,
          type: 'SYSTEM_ALERT',
        })));

        escalations.push({
          clientId: shift.clientId,
          clientName: shift.client.name,
          missedCaregiver: shift.caregiver.name,
          error: 'No backup caregiver available in pod.',
        });
      }
    }

    return NextResponse.json({
      processedCount: missedShifts.length,
      escalatedCount: escalations.filter(e => !e.error).length,
      failedCount: escalations.filter(e => e.error).length,
      escalations,
    });
  } catch (error) {
    console.error('Failed running auto-escalation check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
