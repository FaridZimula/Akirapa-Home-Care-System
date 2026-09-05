import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus } from '@prisma/client';
import { formatDate, formatTime } from '@/lib/dateFormat';
import { notifyAdmins, notifyCaregiver } from '@/lib/notifications';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only family members (or admins acting on family's behalf) can approve/decline visits
    const isFamilyMember = sessionUser.role === 'FAMILY_MEMBER';
    const isSupervisor = sessionUser.role === 'ADMIN';
    if (!isFamilyMember && !isSupervisor) {
      return NextResponse.json(
        { error: 'Only family members or administrators can approve or decline caregiver visits' },
        { status: 403 }
      );
    }

    const { shiftId, approve } = await request.json();

    if (!shiftId || approve === undefined) {
      return NextResponse.json({ error: 'shiftId and approve (true/false) are required' }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        caregiver: true,
        client: {
          include: {
            familyMembers: { select: { userId: true } },
          },
        },
      },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // Family members may only act on shifts linked to their client
    if (isFamilyMember) {
      const isLinked = shift.client.familyMembers.some(f => f.userId === sessionUser.id);
      if (!isLinked) {
        return NextResponse.json({ error: 'You are not linked to this client' }, { status: 403 });
      }
    }

    // Only CAREGIVER_CONFIRMED shifts need family approval
    if (shift.status !== ShiftStatus.CAREGIVER_CONFIRMED) {
      return NextResponse.json(
        {
          error:
            shift.status === ShiftStatus.CONFIRMED
              ? 'This visit has already been approved.'
              : shift.status === ShiftStatus.DROPPED
              ? 'This shift has already been cancelled.'
              : `This shift is not awaiting family approval (current status: ${shift.status}).`,
        },
        { status: 400 }
      );
    }

    const now = new Date();

    if (approve) {
      // ── Family APPROVES the visit ─────────────────────────────────────────
      const updatedShift = await prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.CONFIRMED,
          familyConfirmedAt: now,
        },
      });

      await logAudit({
        userId: sessionUser.id,
        action: 'FAMILY_APPROVED_VISIT',
        details: `Family member ${sessionUser.name} approved caregiver ${shift.caregiver.name}'s visit for ${shift.client.name} on ${shift.scheduledStart.toISOString()}.`,
        outcome: 'SUCCESS',
      });

      // Notify caregiver: visit is fully confirmed
      await notifyCaregiver({
        caregiverId: shift.caregiverId,
        title: '✅ Visit Approved by Family',
        message: `Great news! The family of ${shift.client.name} has approved your visit on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}. Your shift is now fully confirmed.`,
        type: 'SHIFT_CONFIRMED',
      });

      // Notify admins
      await notifyAdmins({
        title: 'Family Approved Caregiver Visit',
        message: `The family approved caregiver ${shift.caregiver.name}'s visit for ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}. Shift is now CONFIRMED.`,
        type: 'SHIFT_CONFIRMED',
      });

      return NextResponse.json({
        success: true,
        approved: true,
        shift: updatedShift,
        message: `Visit approved! Caregiver ${shift.caregiver.name} has been notified and is confirmed for the visit.`,
      });

    } else {
      // ── Family DECLINES the visit ─────────────────────────────────────────
      const updatedShift = await prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.DROPPED,
          familyDeclinedAt: now,
        },
      });

      await logAudit({
        userId: sessionUser.id,
        action: 'FAMILY_DECLINED_VISIT',
        details: `Family member ${sessionUser.name} declined caregiver ${shift.caregiver.name}'s visit for ${shift.client.name} on ${shift.scheduledStart.toISOString()}.`,
        outcome: 'SUCCESS',
      });

      // Notify caregiver: visit declined
      await notifyCaregiver({
        caregiverId: shift.caregiverId,
        title: '❌ Visit Declined by Family',
        message: `The family of ${shift.client.name} has declined your visit scheduled for ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}. Please contact the care coordinator for more details.`,
        type: 'SHIFT_DROPPED',
      });

      // Notify admins: needs rescheduling
      await notifyAdmins({
        title: '⚠️ Family Declined Caregiver Visit',
        message: `The family declined caregiver ${shift.caregiver.name}'s visit for ${shift.client.name} on ${formatDate(shift.scheduledStart)}. The shift has been dropped and may need rescheduling.`,
        type: 'SHIFT_DROPPED',
      });

      return NextResponse.json({
        success: true,
        approved: false,
        shift: updatedShift,
        message: `Visit declined. Caregiver ${shift.caregiver.name} and the care team have been notified.`,
      });
    }

  } catch (error) {
    console.error('Failed to process family visit confirmation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
