import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser, createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { computeHaversineDistance } from '@/lib/geo';
import { ShiftStatus } from '@prisma/client';

// Grace period added past the shift's scheduled end so the caregiver's session
// survives long enough to complete the mandatory clock-out questionnaire even
// if they run into overtime.
const OVERTIME_GRACE_MS = 4 * 60 * 60 * 1000; // 4 hours

// Keeps the caregiver's session alive for the shift's duration (+ overtime grace)
// instead of the normal 15-minute idle window, by re-issuing the session cookie
// on the clock-in response.
function extendSessionForShift(response: NextResponse, userId: string, scheduledEnd: Date) {
  const extendedExpiry = new Date(scheduledEnd.getTime() + OVERTIME_GRACE_MS);
  const session = createSessionCookie(userId, extendedExpiry);
  response.cookies.set(session.name, session.value, sessionCookieOptions(session.maxAge));
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

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

    const isAssignedCaregiver = shift.caregiverId === sessionUser.id;
    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
    if (!isAssignedCaregiver && !isSupervisor) {
      await logAudit({
        userId: sessionUser.id,
        action: 'CLOCK_IN_FORBIDDEN',
        details: `User ${sessionUser.email} attempted to clock in on a shift not assigned to them (shift ${shiftId}).`,
        outcome: 'FAILURE',
      });
      return NextResponse.json({ error: 'You are not authorized to act on this shift' }, { status: 403 });
    }

    if (shift.status === ShiftStatus.UNCONFIRMED) {
      return NextResponse.json({ error: 'Shift must be confirmed before you can clock in.' }, { status: 400 });
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

      const overrideResponse = NextResponse.json({
        success: true,
        shift: updatedShift,
        message: 'Clock-in submitted via administrator manual override request.',
      });
      // Only extend the session of the caregiver clocking themself in - not a
      // supervisor performing the override on someone else's behalf.
      if (sessionUser.id === shift.caregiverId) {
        extendSessionForShift(overrideResponse, sessionUser.id, shift.scheduledEnd);
      }
      return overrideResponse;
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

    const response = NextResponse.json({
      success: true,
      shift: updatedShift,
      distance: Math.round(distance),
      message: 'Clock-in validated successfully within patient boundary.',
    });
    if (sessionUser.id === shift.caregiverId) {
      extendSessionForShift(response, sessionUser.id, shift.scheduledEnd);
    }
    return response;
  } catch (error) {
    console.error('Clock-in error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
