import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus } from '@prisma/client';
import { encrypt } from '@/lib/crypto';
import { formatDate, formatTime } from '@/lib/dateFormat';

export async function POST(request: Request) {
  try {
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

    const now = new Date();

    // 1. Caregiver Confirming Presence / Pre-shift Readiness check-in for CONFIRMED shift
    if (confirmPresence && shift.status === ShiftStatus.CONFIRMED) {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CAREGIVER_PRESENCE_CONFIRMED',
        details: `Caregiver ${shift.caregiver.name} confirmed pre-shift presence and readiness for visit with client ${shift.client.name}.`,
        outcome: 'SUCCESS',
      });

      return NextResponse.json({
        success: true,
        message: `Pre-shift presence confirmed for ${shift.caregiver.name}! Client site readiness verified.`,
        shift,
      });
    }

    // 2. Standard Shift Confirmation (Unconfirmed -> Confirmed by Caregiver or Admin)
    if (shift.status !== ShiftStatus.UNCONFIRMED) {
      return NextResponse.json({ error: 'Shift is already confirmed or in progress' }, { status: 400 });
    }

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.CONFIRMED,
        confirmedAt: now,
      }
    });

    // Log confirmation audit event
    const actionName = confirmedByAdmin ? 'ADMIN_FORCE_CONFIRM_SHIFT' : 'SHIFT_CONFIRMATION';
    const auditDetails = confirmedByAdmin
      ? `[ADMIN APPROVAL] Admin confirmed shift for caregiver ${shift.caregiver.name} and client ${shift.client.name} (Scheduled: ${shift.scheduledStart.toISOString()}).`
      : `Caregiver ${shift.caregiver.name} confirmed shift availability for client ${shift.client.name} (Scheduled: ${shift.scheduledStart.toISOString()}).`;

    await logAudit({
      userId: confirmedByAdmin ? 'ADMIN' : shift.caregiverId,
      action: actionName,
      details: auditDetails,
      outcome: 'SUCCESS',
    });

    // Log shift confirmation activity for family member view
    await logAudit({
      userId: sessionUser.id,
      action: 'SHIFT_CONFIRMED',
      details: confirmedByAdmin
        ? `[ADMIN APPROVED] Admin confirmed caregiver ${shift.caregiver.name} for scheduled visit on ${formatDate(shift.scheduledStart)} (Client: ${shift.client.name}).`
        : `Caregiver ${shift.caregiver.name} confirmed scheduled visit on ${formatDate(shift.scheduledStart)} starting at ${formatTime(shift.scheduledStart)} (Client: ${shift.client.name}).`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, shift: updatedShift, confirmedByAdmin: Boolean(confirmedByAdmin) });
  } catch (error) {
    console.error('Failed to confirm shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
