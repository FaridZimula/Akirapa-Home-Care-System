import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus } from '@prisma/client';
import { encrypt } from '@/lib/crypto';
import { formatDate, formatTime } from '@/lib/dateFormat';
import { createNotification, notifyAdmins, notifyClientFamily, notifyCaregiver } from '@/lib/notifications';

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

    // 1. Caregiver Confirming Presence / Pre-shift Readiness check-in for CONFIRMED shift
    if (confirmPresence && shift.status === ShiftStatus.CONFIRMED) {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CAREGIVER_PRESENCE_CONFIRMED',
        details: `Caregiver ${shift.caregiver.name} confirmed pre-shift presence and readiness for visit with client ${shift.client.name}.`,
        outcome: 'SUCCESS',
      });

      // Notify Client / Family
      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Caregiver En Route / Ready',
        message: `Caregiver ${shift.caregiver.name} has checked in and verified readiness for the visit with ${shift.client.name} today.`,
        type: 'SHIFT_CONFIRMED',
      });

      // Notify Admins
      await notifyAdmins({
        title: 'Pre-Shift Presence Confirmed',
        message: `Caregiver ${shift.caregiver.name} confirmed pre-shift readiness for client ${shift.client.name} (${formatTime(shift.scheduledStart)}).`,
        type: 'SHIFT_CONFIRMED',
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
      userId: sessionUser.id,
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

    // MULTI-PARTY NOTIFICATIONS:
    if (confirmedByAdmin) {
      // 3-Party Notification when Admin Approves:
      // (a) Caregiver is notified
      await notifyCaregiver({
        caregiverId: shift.caregiverId,
        title: 'Shift Approved by Admin',
        message: `Your shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)} has been approved and confirmed by administration.`,
        type: 'SHIFT_CONFIRMED',
      });

      // (b) Client / Family is notified
      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Shift Confirmed by Administration',
        message: `The care visit for ${shift.client.name} with caregiver ${shift.caregiver.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)} has been confirmed by administration.`,
        type: 'SHIFT_CONFIRMED',
      });

      // (c) Admins receive confirmation record
      await notifyAdmins({
        title: 'Shift Approved & Confirmed',
        message: `Admin ${sessionUser.name} confirmed shift for caregiver ${shift.caregiver.name} with client ${shift.client.name} (${formatDate(shift.scheduledStart)}).`,
        type: 'SHIFT_CONFIRMED',
      });
    } else {
      // 2-Party / 3-Party Notification when Caregiver Confirms:
      // (a) Client / Family is notified
      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Caregiver Confirmed Visit',
        message: `Caregiver ${shift.caregiver.name} has confirmed attendance for the care visit on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}.`,
        type: 'SHIFT_CONFIRMED',
      });

      // (b) Admins are notified
      await notifyAdmins({
        title: 'Shift Confirmed by Caregiver',
        message: `Caregiver ${shift.caregiver.name} confirmed their shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}.`,
        type: 'SHIFT_CONFIRMED',
      });

      // (c) Caregiver confirmation receipt
      await notifyCaregiver({
        caregiverId: shift.caregiverId,
        title: 'Shift Confirmed',
        message: `You successfully confirmed your shift for ${shift.client.name} on ${formatDate(shift.scheduledStart)} at ${formatTime(shift.scheduledStart)}.`,
        type: 'SHIFT_CONFIRMED',
      });
    }

    return NextResponse.json({ success: true, shift: updatedShift, confirmedByAdmin: Boolean(confirmedByAdmin) });
  } catch (error) {
    console.error('Failed to confirm shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
