import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus } from '@prisma/client';
import { createNotification } from '@/lib/notifications';

// Haversine formula to compute distance between two coordinates in meters
function computeHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

export async function POST(request: Request) {
  try {
    const { shiftId, latitude, longitude, isOverride, overrideReason } = await request.json();

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

    const now = new Date();

    // 1. Manual Override Path
    if (isOverride) {
      if (!overrideReason) {
        return NextResponse.json({ error: 'Override reason is required' }, { status: 400 });
      }

      const updatedShift = await prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.IN_PROGRESS,
          actualStart: now,
          isOverrideException: true,
          overrideReason,
        },
      });

      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_IN_OVERRIDE_REQUEST',
        details: `Caregiver ${shift.caregiver.name} requested manual override clock-in for client ${shift.client.name}. Reason: ${overrideReason}`,
        outcome: 'SUCCESS',
      });

      // Notify Admins & Coordinators
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } },
      });
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          title: 'Clock-In Override Requested',
          message: `Caregiver ${shift.caregiver.name} requested manual override clock-in for client ${shift.client.name}. Reason: ${overrideReason}`,
          type: 'EXCEPTION_OVERRIDE',
        });
      }

      return NextResponse.json({
        success: true,
        shift: updatedShift,
        message: 'Clock-in submitted via administrator manual override request.',
      });
    }

    // 2. Geofenced Validation Path
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'GPS coordinates are required for geofence validation' }, { status: 400 });
    }

    const distance = computeHaversineDistance(
      latitude,
      longitude,
      shift.client.latitude,
      shift.client.longitude
    );

    const radius = shift.client.geofenceRadiusMeter;

    if (distance > radius) {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_IN_FAILED_GEOFENCE',
        details: `Caregiver ${shift.caregiver.name} failed clock-in for client ${shift.client.name}. Located ${Math.round(distance)}m away (Limit: ${radius}m).`,
        outcome: 'FAILURE',
      });

      return NextResponse.json(
        {
          error: 'Outside Patient Boundary',
          distance: Math.round(distance),
          radius,
          allowOverride: true,
        },
        { status: 400 }
      );
    }

    // Valid clock-in
    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.IN_PROGRESS,
        actualStart: now,
        clockInLat: latitude,
        clockInLng: longitude,
      },
    });

    await logAudit({
      userId: shift.caregiverId,
      action: 'CLOCK_IN_SUCCESS',
      details: `Caregiver ${shift.caregiver.name} clocked in successfully for client ${shift.client.name} (${Math.round(distance)}m from site center).`,
      outcome: 'SUCCESS',
    });

    // Seed location history entry
    await prisma.caregiverLocationHistory.create({
      data: {
        shiftId: shift.id,
        latitude,
        longitude,
        timestamp: now,
      },
    });

    return NextResponse.json({
      success: true,
      shift: updatedShift,
      distance: Math.round(distance),
      message: 'Clock-in validated successfully within patient boundary.',
    });
  } catch (error) {
    console.error('Clock-in error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
