import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus } from '@prisma/client';
import { formatDate, formatTime } from '@/lib/dateFormat';
import { notifyAdmins, notifyClientFamily, notifyCaregiver } from '@/lib/notifications';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { shiftId, confirmedByAdmin, confirmPresence } = await request.json();

    if (!shiftId) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { caregiver: true, client: true }
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const isAssignedCaregiver = shift.caregiverId === sessionUser.id;
    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
    if (!isAssignedCaregiver && !isSupervisor) {
      return NextResponse.json({ error: 'You are not authorized to act on this shift' }, { status: 403 });
    }

    const now = new Date();

    // ── Pre-shift presence check-in (already CONFIRMED shift) ─────────────────
    if (confirmPresence && shift.status === ShiftStatus.CONFIRMED) {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CAREGIVER_PRESENCE_CONFIRMED',
        details: `Caregiver ${shift.caregiver.name} confirmed pre-shift presence for visit with client ${shift.client.name}.`,
        outcome: 'SUCCESS',
      });

      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Caregiver En Route / Ready',
        message: `Caregiver ${shift.caregiver.name} has checked in and verified readiness for the visit with ${shift.client.name} today.`,
        type: 'SHIFT_CONFIRMED',
      });

      await notifyAdmins({
        title: 'Pre-Shift Presence Confirmed',
        message: `Caregiver ${shift.caregiver.name} confirmed pre-shift readiness for client ${shift.client.name} (${formatTime(shift.scheduledStart)}).`,
        type: 'SHIFT_CONFIRMED',
      });

      return NextResponse.json({
        success: true,
        message: `Pre-shift presence confirmed for ${shift.caregiver.name}!`,
        shift,
      });
    }

    // ── Admin force-confirm: skips the family approval step ──────────────────
    if (confirmedByAdmin && isSupervisor) {
      if (shift.status === ShiftStatus.CONFIRMED) {
        return NextResponse.json({ error: 'Shift is already confirmed' }, { status: 400 });
      }

      const updatedShift = await prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.CONFIRMED,
          confirmedAt: shift.confirmedAt ?? now,
          familyConfirmedAt: now,
        },
      });

      await logAudit({
        userId: sessionUser.id,
        action: 'ADMIN_FORCE_CONFIRM_SHIFT',
        details: `Admin ${sessionUser.name} force-confirmed shift for caregiver ${shift.caregiver.name} and client ${shift.client.name} (${shift.scheduledStart.toISOString()}).`,
        outcome: 'SUCCESS',
      });

      await notifyCaregiver({
        caregiverId: shift.caregiverId,
        title: 'Shift Approved by Admin',
        message: `Your shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)} has been approved and confirmed by administration.`,
        type: 'SHIFT_CONFIRMED',
      });

      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Care Visit Confirmed by Administration',
        message: `The care visit for ${shift.client.name} with caregiver ${shift.caregiver.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)} has been confirmed by administration.`,
        type: 'SHIFT_CONFIRMED',
      });

      await notifyAdmins({
        title: 'Shift Force-Confirmed by Admin',
        message: `Admin ${sessionUser.name} force-confirmed shift for ${shift.caregiver.name} with client ${shift.client.name} (${formatDate(shift.scheduledStart)}).`,
        type: 'SHIFT_CONFIRMED',
        excludeUserId: sessionUser.id,
      });

      return NextResponse.json({ success: true, shift: updatedShift, confirmedByAdmin: true });
    }

    // ── Caregiver self-confirms: UNCONFIRMED → CAREGIVER_CONFIRMED ────────────
    if (shift.status !== ShiftStatus.UNCONFIRMED) {
      return NextResponse.json(
        { error: 'Shift has already been confirmed or is no longer pending caregiver confirmation' },
        { status: 400 }
      );
    }

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.CAREGIVER_CONFIRMED,
        confirmedAt: now,
      },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'CAREGIVER_CONFIRMED_SHIFT',
      details: `Caregiver ${shift.caregiver.name} confirmed availability for shift with client ${shift.client.name} (${shift.scheduledStart.toISOString()}). Awaiting family approval.`,
      outcome: 'SUCCESS',
    });

    // ── Notify caregiver: confirmation receipt ─────────────────────────────
    await notifyCaregiver({
      caregiverId: shift.caregiverId,
      title: '✅ Shift Confirmed — Awaiting Family Approval',
      message: `You confirmed your shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}. The family has been notified to approve your visit.`,
      type: 'SHIFT_CONFIRMED',
    });

    // ── Notify family: action required to approve the visit ───────────────
    await notifyClientFamily({
      clientId: shift.clientId,
      title: '🔔 Action Required: Approve Caregiver Visit',
      message: `Caregiver ${shift.caregiver.name} has confirmed their visit for ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}. Please open the portal to Approve or Decline this visit.`,
      type: 'SHIFT_CONFIRMED',
    });

    // ── Notify admins: caregiver confirmed, waiting on family ─────────────
    await notifyAdmins({
      title: 'Caregiver Confirmed — Awaiting Family Approval',
      message: `Caregiver ${shift.caregiver.name} confirmed the shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)}. Waiting for family to approve the visit.`,
      type: 'SHIFT_CONFIRMED',
    });

    return NextResponse.json({
      success: true,
      shift: updatedShift,
      confirmedByAdmin: false,
      message: `Shift confirmed! The family of ${shift.client.name} has been notified to approve your visit.`,
    });

  } catch (error) {
    console.error('Failed to confirm shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

