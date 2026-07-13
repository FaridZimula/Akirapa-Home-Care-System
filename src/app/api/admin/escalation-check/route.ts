import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus, PodRole } from '@prisma/client';

export async function POST() {
  try {
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
