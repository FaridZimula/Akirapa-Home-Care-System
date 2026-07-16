import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus } from '@prisma/client';
import { encrypt } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const { shiftId } = await request.json();

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

    if (shift.status !== ShiftStatus.UNCONFIRMED) {
      return NextResponse.json({ error: 'Shift is already confirmed or in progress' }, { status: 400 });
    }

    const now = new Date();

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.CONFIRMED,
        confirmedAt: now,
      }
    });

    // Log confirmation audit event
    await logAudit({
      userId: shift.caregiverId,
      action: 'SHIFT_CONFIRMATION',
      details: `Caregiver ${shift.caregiver.name} confirmed shift availability for client ${shift.client.name} (Scheduled: ${shift.scheduledStart.toISOString()}).`,
      outcome: 'SUCCESS',
    });

    // Log shift confirmation activity for family member view
    const logDetails = {
      type: 'SHIFT_CONFIRMED',
      notes: `Caregiver ${shift.caregiver.name} has confirmed they will work the scheduled visit on ${shift.scheduledStart.toLocaleDateString()} starting at ${shift.scheduledStart.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`,
      caregiverName: shift.caregiver.name,
      hasRedFlags: false,
    };

    const encryptedLog = encrypt(JSON.stringify(logDetails));

    await prisma.activityLog.create({
      data: {
        clientId: shift.clientId,
        shiftId: shift.id,
        encryptedLog,
        mediaUrls: '[]',
      }
    });

    return NextResponse.json({ success: true, shift: updatedShift });
  } catch (error) {
    console.error('Failed to confirm shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
