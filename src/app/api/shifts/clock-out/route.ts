import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus } from '@prisma/client';
import { encrypt } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const { shiftId, completedTaskIds, redFlags, notes } = await request.json();

    if (!shiftId) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { client: true, caregiver: true },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.status !== ShiftStatus.IN_PROGRESS) {
      return NextResponse.json({ error: 'Shift must be in progress to clock out' }, { status: 400 });
    }

    const now = new Date();

    // 1. Mark completed tasks
    if (completedTaskIds && Array.isArray(completedTaskIds)) {
      await prisma.shiftTask.updateMany({
        where: {
          shiftId,
          id: { in: completedTaskIds },
        },
        data: {
          isCompleted: true,
          completedAt: now,
        },
      });
    }

    // 2. Process clinical red flags
    const activeRedFlags = Object.entries(redFlags || {})
      .filter(([_, value]) => value === true)
      .map(([key, _]) => key);

    const hasRedFlags = activeRedFlags.length > 0;

    // 3. Create encrypted activity log details
    const logDetails = {
      notes: notes || 'No notes provided',
      redFlags: redFlags || {},
      hasRedFlags,
      activeRedFlags,
      completedTaskCount: completedTaskIds?.length || 0,
      caregiverName: shift.caregiver.name,
    };

    const encryptedLog = encrypt(JSON.stringify(logDetails));

    // Save activity log
    const activityLog = await prisma.activityLog.create({
      data: {
        clientId: shift.clientId,
        shiftId: shift.id,
        encryptedLog,
        mediaUrls: JSON.stringify([]), // No media on standard clockout
      },
    });

    // 4. Update shift status to COMPLETED
    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.COMPLETED,
        actualEnd: now,
      },
    });

    // 5. Audit log
    await logAudit({
      userId: shift.caregiverId,
      action: 'CLOCK_OUT_SUCCESS',
      details: `Caregiver ${shift.caregiver.name} clocked out for client ${shift.client.name}. Red Flags Detected: ${hasRedFlags ? activeRedFlags.join(', ') : 'None'}.`,
      outcome: 'SUCCESS',
    });

    if (hasRedFlags) {
      // Log special Clinical Red Flag Alert
      await logAudit({
        userId: 'SYSTEM',
        action: 'CLINICAL_RED_FLAG_ALERT',
        details: `CLINICAL ALERT: Red flags raised for client ${shift.client.name} during caregiver ${shift.caregiver.name} shift. Flags: ${activeRedFlags.join(', ')}.`,
        outcome: 'SUCCESS',
      });
    }

    return NextResponse.json({
      success: true,
      shift: updatedShift,
      hasRedFlags,
      activeRedFlags,
      activityLogId: activityLog.id,
      message: 'Clocked out successfully. Care reports archived securely.',
    });
  } catch (error) {
    console.error('Clock-out error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
