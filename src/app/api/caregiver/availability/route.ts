import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

// Fetch weekly availability slots for a caregiver
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caregiverId = searchParams.get('caregiverId');

    if (!caregiverId) {
      return NextResponse.json({ error: 'Caregiver ID is required' }, { status: 400 });
    }

    const availabilities = await prisma.availability.findMany({
      where: { caregiverId },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });

    return NextResponse.json({ availabilities });
  } catch (error) {
    console.error('Failed to load caregiver availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Bulk update weekly availability slots for a caregiver
export async function POST(request: Request) {
  try {
    const { caregiverId, slots } = await request.json();

    if (!caregiverId || !Array.isArray(slots)) {
      return NextResponse.json({ error: 'Caregiver ID and slots array are required' }, { status: 400 });
    }

    // Validate slots format
    for (const slot of slots) {
      if (
        typeof slot.dayOfWeek !== 'number' || 
        slot.dayOfWeek < 0 || 
        slot.dayOfWeek > 6 ||
        typeof slot.startTime !== 'string' ||
        typeof slot.endTime !== 'string'
      ) {
        return NextResponse.json({ error: 'Invalid slot format' }, { status: 400 });
      }
    }

    // Save update inside a transaction to prevent partial updates
    const updatedSlots = await prisma.$transaction(async (tx) => {
      // 1. Delete existing availability blocks
      await tx.availability.deleteMany({
        where: { caregiverId },
      });

      // 2. Insert new blocks
      const data = slots.map(slot => ({
        caregiverId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));

      if (data.length > 0) {
        await tx.availability.createMany({
          data,
        });
      }

      return tx.availability.findMany({
        where: { caregiverId },
        orderBy: [
          { dayOfWeek: 'asc' },
          { startTime: 'asc' }
        ]
      });
    });

    // Write audit log
    await logAudit({
      userId: caregiverId,
      action: 'UPDATE_AVAILABILITY',
      details: `Updated weekly availability blocks (Total slots defined: ${slots.length}).`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, availabilities: updatedSlots });
  } catch (error) {
    console.error('Failed to update caregiver availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
