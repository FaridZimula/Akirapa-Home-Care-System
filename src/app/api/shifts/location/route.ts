import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ShiftStatus } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { shiftId, latitude, longitude } = await request.json();

    if (!shiftId || latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // Privacy lock: only record location if shift is active
    if (shift.status !== ShiftStatus.IN_PROGRESS) {
      return NextResponse.json({
        error: 'Privacy Restriction: Location tracking is disabled because this shift is not in progress.',
        status: shift.status,
      }, { status: 403 });
    }

    const locationRecord = await prisma.caregiverLocationHistory.create({
      data: {
        shiftId,
        latitude,
        longitude,
      },
    });

    return NextResponse.json({ success: true, locationRecord });
  } catch (error) {
    console.error('Failed to log caregiver location:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
