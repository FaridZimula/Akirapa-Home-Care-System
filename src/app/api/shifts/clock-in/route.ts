import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser, createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { computeHaversineDistance } from '@/lib/geo';
import { ShiftStatus } from '@prisma/client';
import { createNotification, notifyAdmins, notifyClientFamily } from '@/lib/notifications';
import { formatTime } from '@/lib/dateFormat';
import { encrypt } from '@/lib/crypto';

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

    const { shiftId, latitude, longitude, isOverride, overrideReason, lateReason } = await request.json();

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

    if (shift.status === ShiftStatus.IN_PROGRESS) {
      return NextResponse.json({ error: 'Caregiver is already clocked into this shift.' }, { status: 400 });
    }

    if (
      shift.status === ShiftStatus.COMPLETED ||
      shift.status === ShiftStatus.DROPPED ||
      shift.status === ShiftStatus.NO_SHOW
    ) {
      return NextResponse.json({ error: `This shift is ${shift.status.toLowerCase().replace('_', ' ')} and cannot be clocked into.` }, { status: 400 });
    }

    // Seed Care Plan tasks into ShiftTask if none exist yet for this shift
    const existingTasksCount = await prisma.shiftTask.count({ where: { shiftId } });
    if (existingTasksCount === 0) {
      const carePlan = await prisma.carePlan.findFirst({
        where: { clientId: shift.clientId },
        include: { tasks: true },
      });
      if (carePlan && carePlan.tasks.length > 0) {
        await prisma.shiftTask.createMany({
          data: carePlan.tasks.map(t => ({
            shiftId,
            taskName: t.taskName,
            description: t.description,
            scheduledTime: t.scheduledTime,
          })),
        });
      }
    }

    const now = new Date();

    // Lateness Calculation (Threshold: 5 minutes past scheduled start time)
    const minutesLate = Math.floor((now.getTime() - new Date(shift.scheduledStart).getTime()) / 60000);
    const isLate = minutesLate > 5;
    const finalReason = overrideReason || lateReason || (isLate ? `${minutesLate} minutes late clock-in` : 'Standard Arrival');

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

      // Auto-record Client Assessment & Activity Log
      const clockInAssessmentLog = {
        type: 'CLOCK_IN_ASSESSMENT',
        caregiverName: shift.caregiver.name,
        clientName: shift.client.name,
        siteAddress: shift.client.address,
        scheduledStart: shift.scheduledStart.toISOString(),
        clockInTime: now.toISOString(),
        isLate,
        minutesLate: isLate ? minutesLate : 0,
        geofenceDistanceMeter: null,
        isOverride: true,
        overrideReason,
        notes: `Caregiver ${shift.caregiver.name} clocked in via manual override for ${shift.client.name}.${isLate ? ` [LATE ARRIVAL: ${minutesLate} mins past scheduled start]` : ''} Reason: "${overrideReason}".`,
      };

      await prisma.activityLog.create({
        data: {
          clientId: shift.clientId,
          shiftId: shift.id,
          encryptedLog: encrypt(JSON.stringify(clockInAssessmentLog)),
          mediaUrls: JSON.stringify([]),
        },
      });

      await logAudit({
        userId: shift.caregiverId,
        action: isLate ? 'CLOCK_IN_LATE_ARRIVED' : 'CLOCK_IN_OVERRIDE_REQUEST',
        details: `Caregiver ${shift.caregiver.name} requested manual override clock-in for client ${shift.client.name}.${isLate ? ` Lateness: ${minutesLate} mins late.` : ''} Reason: ${overrideReason}`,
        outcome: 'SUCCESS',
      });

      // Notify Admins of Override & Lateness
      await notifyAdmins({
        title: isLate ? `🚨 Late Clock-In Override — ${shift.client.name}` : '⚠️ Clock-In Exception Override',
        message: `Caregiver ${shift.caregiver.name} clocked in for client ${shift.client.name} via manual override.${isLate ? ` [${minutesLate} MINS LATE]` : ''} Reason: "${overrideReason}".`,
        type: isLate ? 'LATE_ARRIVAL' : 'EXCEPTION_OVERRIDE',
      });

      // Notify Client / Family of Shift Start
      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Caregiver Arrived',
        message: `Caregiver ${shift.caregiver.name} has arrived and started the care visit for ${shift.client.name}.`,
        type: 'SHIFT_STARTED',
      });

      const overrideResponse = NextResponse.json({
        success: true,
        shift: updatedShift,
        isLate,
        minutesLate: isLate ? minutesLate : 0,
        message: `Clock-in submitted via administrator manual override request.${isLate ? ` (${minutesLate} mins late logged)` : ''}`,
      });
      if (sessionUser.id === shift.caregiverId) {
        extendSessionForShift(overrideResponse, sessionUser.id, shift.scheduledEnd);
      }
      return overrideResponse;
    }

    // 2. Geofenced Validation Path (Default 100m Radius)
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'GPS coordinates are required for geofence validation' }, { status: 400 });
    }

    const distance = computeHaversineDistance(
      latitude,
      longitude,
      shift.client.latitude,
      shift.client.longitude
    );

    const radius = shift.client.geofenceRadiusMeter || 100;

    if (distance > radius) {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_IN_FAILED_GEOFENCE',
        details: `Caregiver ${shift.caregiver.name} failed clock-in for client ${shift.client.name}. Located ${Math.round(distance)}m away (Limit: ${radius}m).`,
        outcome: 'FAILURE',
      });

      return NextResponse.json(
        {
          error: `Outside Assigned Area (Located ${Math.round(distance)}m away, Limit: ${radius}m)`,
          distance: Math.round(distance),
          radius,
          allowOverride: true,
        },
        { status: 400 }
      );
    }

    // Valid clock-in (within 100m radius)
    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.IN_PROGRESS,
        actualStart: now,
        clockInLat: latitude,
        clockInLng: longitude,
      },
    });

    // Auto-record Client Assessment & Activity Log
    const clockInAssessmentLog = {
      type: 'CLOCK_IN_ASSESSMENT',
      caregiverName: shift.caregiver.name,
      clientName: shift.client.name,
      siteAddress: shift.client.address,
      scheduledStart: shift.scheduledStart.toISOString(),
      clockInTime: now.toISOString(),
      isLate,
      minutesLate: isLate ? minutesLate : 0,
      geofenceDistanceMeter: Math.round(distance),
      isOverride: false,
      notes: isLate
        ? `Caregiver ${shift.caregiver.name} clocked in ${minutesLate} minutes late for ${shift.client.name} (${Math.round(distance)}m from site center). Reason: ${finalReason}.`
        : `Caregiver ${shift.caregiver.name} arrived on-site and clocked in for ${shift.client.name} (${Math.round(distance)}m from site center).`,
    };

    await prisma.activityLog.create({
      data: {
        clientId: shift.clientId,
        shiftId: shift.id,
        encryptedLog: encrypt(JSON.stringify(clockInAssessmentLog)),
        mediaUrls: JSON.stringify([]),
      },
    });

    await logAudit({
      userId: shift.caregiverId,
      action: isLate ? 'CLOCK_IN_LATE_ARRIVED' : 'CLOCK_IN_SUCCESS',
      details: `Caregiver ${shift.caregiver.name} clocked in successfully for client ${shift.client.name} (${Math.round(distance)}m from site center).${isLate ? ` [LATE: ${minutesLate} mins late]` : ''}`,
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

    // Notify Client / Family
    await notifyClientFamily({
      clientId: shift.clientId,
      title: 'Caregiver Arrived',
      message: `Caregiver ${shift.caregiver.name} has arrived on-site and clocked in for ${shift.client.name}'s care visit at ${formatTime(now)}.`,
      type: 'SHIFT_STARTED',
    });

    // Notify Admins with Lateness or Validation Details
    if (isLate) {
      await notifyAdmins({
        title: `🚨 Late Arrival Alert — ${shift.client.name}`,
        message: `Caregiver ${shift.caregiver.name} clocked in ${minutesLate} mins late for ${shift.client.name} (Scheduled: ${formatTime(shift.scheduledStart)}, Actual: ${formatTime(now)}). Reason: "${finalReason}".`,
        type: 'LATE_ARRIVAL',
      });
    } else {
      await notifyAdmins({
        title: '✅ Care Visit Started',
        message: `Caregiver ${shift.caregiver.name} clocked in for ${shift.client.name} at ${formatTime(now)} (Validated ${Math.round(distance)}m from site center, Limit: ${radius}m).`,
        type: 'SHIFT_STARTED',
      });
    }

    const response = NextResponse.json({
      success: true,
      shift: updatedShift,
      distance: Math.round(distance),
      isLate,
      minutesLate: isLate ? minutesLate : 0,
      message: isLate
        ? `Clock-in validated (${minutesLate} mins late recorded into client assessment).`
        : 'Clock-in validated successfully within 100m patient boundary.',
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
