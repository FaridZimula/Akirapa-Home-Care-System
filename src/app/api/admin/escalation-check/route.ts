import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { createNotification, notifyAdmins, notifyClientFamily } from '@/lib/notifications';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus, PodRole } from '@prisma/client';
import { formatDate, formatTime, formatDateTime } from '@/lib/dateFormat';
import { encrypt } from '@/lib/crypto';
import {
  MISSED_CLOCK_IN_ALERT_MINUTES,
  NO_SHOW_MINUTES,
  minutesLateFrom,
} from '@/lib/attendance';

export async function POST(request: Request) {
  try {
    // Allow the scheduled cron trigger (Bearer CRON_SECRET) or a logged-in admin/coordinator
    // clicking "Run Escalation Check" manually from the Business Hub.
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCronRequest = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

    if (!isCronRequest) {
      const sessionUser = await getSessionUser();
      if (!sessionUser || sessionUser.role !== 'ADMIN') {
        return NextResponse.json({ error: 'System escalation checks are restricted to administrators' }, { status: 403 });
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
          where: { role: 'ADMIN' },
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
          message: `You did not confirm your shift for ${shift.client.name} (${formatDate(shift.scheduledStart)}) before the 24-hour deadline. It has been reassigned to another caregiver. Repeated missed confirmations may affect your standing and future shift assignments.`,
          type: 'SHIFT_CONFIRMATION_MISSED',
        });

        // Notify the backup caregiver of their new assignment
        await createNotification({
          userId: backupAssignment.caregiverId,
          title: 'New Shift Assigned',
          message: `You've been assigned to cover client ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)} after the primary caregiver missed their confirmation deadline. Please confirm before ${formatDateTime(nextDeadline)}.`,
          type: 'SHIFT_ASSIGNED',
        });

        // Surface the event to admins/coordinators
        await Promise.all(adminUsers.map(admin => createNotification({
          userId: admin.id,
          title: 'Shift Auto-Escalated',
          message: `${shift.caregiver.name} missed the confirmation deadline for ${shift.client.name}'s shift on ${formatDate(shift.scheduledStart)}. Auto-reassigned to backup caregiver ${backupAssignment!.caregiver.name}.`,
          type: 'SYSTEM_ALERT',
        })));

        escalations.push({
          clientId: shift.clientId,
          clientName: shift.client.name,
          missedCaregiver: shift.caregiver.name,
          backupCaregiver: backupAssignment.caregiver.name,
          smsAlertMock: {
            to: backupAssignment.caregiver.phoneNumber || '+16045550000',
            message: `AUTO-ALERT: Shift confirmation missed by primary caregiver. You have been assigned to cover client ${shift.client.name} on ${formatDate(shift.scheduledStart)}. Confirm before ${formatTime(nextDeadline)}.`,
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
          message: `You did not confirm your shift for ${shift.client.name} (${formatDate(shift.scheduledStart)}) before the 24-hour deadline. No backup caregiver was available to cover it. Contact your coordinator immediately - repeated missed confirmations may affect your standing and future shift assignments.`,
          type: 'SHIFT_CONFIRMATION_MISSED',
        });

        // Critical: no coverage found, admins/coordinators must intervene manually
        await Promise.all(adminUsers.map(admin => createNotification({
          userId: admin.id,
          title: '🚨 CRITICAL: Unfilled Shift',
          message: `${shift.caregiver.name} missed the confirmation deadline for ${shift.client.name}'s shift on ${formatDate(shift.scheduledStart)} and no backup caregiver was available in the pod. This shift needs manual coverage now.`,
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

    // ── 2. Missed clock-ins ──────────────────────────────────────────────────
    // A shift that was confirmed but never clocked into is an attendance failure
    // in its own right. It is recorded against the client's assessment with the
    // scheduled time and how long the caregiver has been unaccounted for, so a
    // no-show leaves the same paper trail a late arrival does.
    const alertCutoff = new Date(now.getTime() - MISSED_CLOCK_IN_ALERT_MINUTES * 60 * 1000);

    const unclockedShifts = await prisma.shift.findMany({
      where: {
        status: { in: [ShiftStatus.CONFIRMED, ShiftStatus.CAREGIVER_CONFIRMED] },
        actualStart: null,
        scheduledStart: { lte: alertCutoff },
      },
      include: { client: true, caregiver: true },
    });

    const missedClockIns: {
      shiftId: string;
      clientName: string;
      caregiverName: string;
      scheduledStart: string;
      minutesOverdue: number;
      outcome: 'NO_SHOW' | 'ALERTED';
    }[] = [];

    for (const shift of unclockedShifts) {
      const minutesOverdue = minutesLateFrom(shift.scheduledStart, now);
      const isNoShow = minutesOverdue >= NO_SHOW_MINUTES;

      // Below the no-show line, alert once and leave the shift open so the
      // caregiver can still turn up and clock in late with a reason.
      if (!isNoShow && shift.missedClockInAlertAt) continue;

      if (isNoShow) {
        await prisma.shift.update({
          where: { id: shift.id },
          data: {
            status: ShiftStatus.NO_SHOW,
            minutesLate: minutesOverdue,
            missedClockInAlertAt: shift.missedClockInAlertAt ?? now,
          },
        });

        // Auto-record the failure on the client's assessment, same as a clock-in.
        await prisma.activityLog.create({
          data: {
            clientId: shift.clientId,
            shiftId: shift.id,
            encryptedLog: encrypt(JSON.stringify({
              type: 'MISSED_CLOCK_IN',
              caregiverName: shift.caregiver.name,
              clientName: shift.client.name,
              siteAddress: shift.client.address,
              scheduledStart: shift.scheduledStart.toISOString(),
              scheduledEnd: shift.scheduledEnd.toISOString(),
              detectedAt: now.toISOString(),
              minutesOverdue,
              clockInTime: null,
              lateReason: null,
              outcome: 'NO_SHOW',
              notes: `Caregiver ${shift.caregiver.name} did not clock in for ${shift.client.name}'s visit scheduled at ${formatTime(shift.scheduledStart)} on ${formatDate(shift.scheduledStart)}. Marked as a no-show after ${minutesOverdue} minutes with no arrival and no reason given.`,
            })),
            mediaUrls: JSON.stringify([]),
          },
        });

        await logAudit({
          userId: 'SYSTEM',
          action: 'SHIFT_NO_SHOW',
          details: `Caregiver ${shift.caregiver.name} never clocked in for client ${shift.client.name} (scheduled ${shift.scheduledStart.toISOString()}). Auto-marked NO_SHOW after ${minutesOverdue} minutes.`,
          outcome: 'FAILURE',
        });

        await notifyAdmins({
          title: `🚨 No-Show — ${shift.client.name}`,
          message: `${shift.caregiver.name} never clocked in for ${shift.client.name}'s ${formatTime(shift.scheduledStart)} visit and is now ${minutesOverdue} minutes overdue. The shift has been marked NO_SHOW and needs cover.`,
          type: 'SYSTEM_ALERT',
        });

        await createNotification({
          userId: shift.caregiverId,
          title: '🚨 Shift Marked No-Show',
          message: `You did not clock in for ${shift.client.name}'s visit scheduled at ${formatTime(shift.scheduledStart)} on ${formatDate(shift.scheduledStart)}. It has been recorded as a no-show after ${minutesOverdue} minutes. Contact your coordinator immediately.`,
          type: 'SYSTEM_ALERT',
        });

        await notifyClientFamily({
          clientId: shift.clientId,
          title: 'Visit Not Started',
          message: `The caregiver scheduled for ${shift.client.name} at ${formatTime(shift.scheduledStart)} has not arrived. Our coordinators have been alerted and are arranging cover.`,
          type: 'SYSTEM_ALERT',
        });
      } else {
        await prisma.shift.update({
          where: { id: shift.id },
          data: { minutesLate: minutesOverdue, missedClockInAlertAt: now },
        });

        await logAudit({
          userId: 'SYSTEM',
          action: 'CLOCK_IN_MISSED',
          details: `Caregiver ${shift.caregiver.name} has not clocked in for client ${shift.client.name} (scheduled ${shift.scheduledStart.toISOString()}); ${minutesOverdue} minutes overdue.`,
          outcome: 'FAILURE',
        });

        await notifyAdmins({
          title: `⚠️ Missed Clock-In — ${shift.client.name}`,
          message: `${shift.caregiver.name} has not clocked in for ${shift.client.name}'s ${formatTime(shift.scheduledStart)} visit and is ${minutesOverdue} minutes overdue. It will be marked a no-show at ${NO_SHOW_MINUTES} minutes.`,
          type: 'LATE_ARRIVAL',
        });

        await createNotification({
          userId: shift.caregiverId,
          title: '⚠️ You Have Not Clocked In',
          message: `Your visit for ${shift.client.name} was scheduled to start at ${formatTime(shift.scheduledStart)} and you are ${minutesOverdue} minutes overdue. Clock in on site as soon as you arrive — you will be asked for the reason for the delay.`,
          type: 'LATE_ARRIVAL',
        });
      }

      missedClockIns.push({
        shiftId: shift.id,
        clientName: shift.client.name,
        caregiverName: shift.caregiver.name,
        scheduledStart: shift.scheduledStart.toISOString(),
        minutesOverdue,
        outcome: isNoShow ? 'NO_SHOW' : 'ALERTED',
      });
    }

    return NextResponse.json({
      processedCount: missedShifts.length,
      escalatedCount: escalations.filter(e => !e.error).length,
      failedCount: escalations.filter(e => e.error).length,
      escalations,
      missedClockInCount: missedClockIns.length,
      noShowCount: missedClockIns.filter(m => m.outcome === 'NO_SHOW').length,
      missedClockIns,
    });
  } catch (error) {
    console.error('Failed running auto-escalation check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled paths with GET, so the sweep is exposed under
// both verbs: GET for the scheduler (Bearer CRON_SECRET), POST for the
// "Run Escalation Check" button in the Business Hub.
export async function GET(request: Request) {
  return POST(request);
}
