import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser, createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { computeHaversineDistance } from '@/lib/geo';
import { ShiftStatus } from '@prisma/client';
import { createNotification, notifyAdmins, notifyClientFamily } from '@/lib/notifications';
import { formatTime } from '@/lib/dateFormat';
import { encrypt } from '@/lib/crypto';
import {
  GEOFENCE_DEFAULT_RADIUS_METERS,
  MAX_GPS_ACCURACY_METERS,
  LATE_GRACE_MINUTES,
  minutesLateFrom,
} from '@/lib/attendance';

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

    const { shiftId, latitude, longitude, accuracy, isOverride, overrideReason, lateReason } =
      await request.json();

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
    const isSupervisor = sessionUser.role === 'ADMIN';
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
    const minutesLate = minutesLateFrom(shift.scheduledStart, now);
    const isLate = minutesLate > LATE_GRACE_MINUTES;
    const radius = shift.client.geofenceRadiusMeter || GEOFENCE_DEFAULT_RADIUS_METERS;

    // 1. Administrator override.
    // Only an admin can put a caregiver on the clock from outside the geofence.
    // A caregiver cannot wave themselves through - that is the whole point of a
    // geofence; they call their coordinator, who overrides it here on the record.
    if (isOverride) {
      if (!isSupervisor) {
        await logAudit({
          userId: sessionUser.id,
          action: 'CLOCK_IN_OVERRIDE_DENIED',
          details: `Caregiver ${sessionUser.email} attempted to self-override the geofence for shift ${shiftId}. Override requires an administrator.`,
          outcome: 'FAILURE',
        });
        return NextResponse.json(
          { error: 'Only an administrator can override the geofence. Contact your coordinator to be clocked in manually.' },
          { status: 403 }
        );
      }

      if (!overrideReason || !String(overrideReason).trim()) {
        return NextResponse.json({ error: 'Override reason is required' }, { status: 400 });
      }

      const overrideDistance =
        typeof latitude === 'number' && typeof longitude === 'number'
          ? computeHaversineDistance(latitude, longitude, shift.client.latitude, shift.client.longitude)
          : null;

      const updatedShift = await prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.IN_PROGRESS,
          actualStart: now,
          clockInLat: typeof latitude === 'number' ? latitude : null,
          clockInLng: typeof longitude === 'number' ? longitude : null,
          clockInDistanceMeter: overrideDistance,
          minutesLate: isLate ? minutesLate : null,
          lateReason: isLate ? (lateReason || overrideReason) : null,
          isOverrideException: true,
          overrideReason,
          overrideApprovedBy: sessionUser.id,
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
        lateReason: isLate ? (lateReason || overrideReason) : null,
        geofenceRadiusMeter: radius,
        geofenceDistanceMeter: overrideDistance === null ? null : Math.round(overrideDistance),
        isOverride: true,
        overrideReason,
        overrideApprovedBy: sessionUser.email,
        notes: `Caregiver ${shift.caregiver.name} was clocked in for ${shift.client.name} by administrator ${sessionUser.name} via manual override.${isLate ? ` [LATE ARRIVAL: ${minutesLate} mins past scheduled start]` : ''} Reason: "${overrideReason}".`,
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
        userId: sessionUser.id,
        action: 'CLOCK_IN_ADMIN_OVERRIDE',
        details: `Admin ${sessionUser.email} manually clocked in caregiver ${shift.caregiver.name} for client ${shift.client.name}.${isLate ? ` Lateness: ${minutesLate} mins.` : ''}${overrideDistance === null ? ' No GPS fix supplied.' : ` Device was ${Math.round(overrideDistance)}m from site (limit ${radius}m).`} Reason: ${overrideReason}`,
        outcome: 'SUCCESS',
      });

      // Tell the other admins an exception was granted, and by whom.
      await notifyAdmins({
        title: isLate ? `Late Clock-In Override - ${shift.client.name}` : 'Clock-In Geofence Override',
        message: `${sessionUser.name} manually clocked in ${shift.caregiver.name} for ${shift.client.name}.${isLate ? ` [${minutesLate} MINS LATE]` : ''}${overrideDistance === null ? '' : ` Device was ${Math.round(overrideDistance)}m from site.`} Reason: "${overrideReason}".`,
        type: isLate ? 'LATE_ARRIVAL' : 'EXCEPTION_OVERRIDE',
        excludeUserId: sessionUser.id,
      });

      // Leave the caregiver a record of the exception on their own account.
      await createNotification({
        userId: shift.caregiverId,
        title: 'Clocked In By Administrator',
        message: `${sessionUser.name} clocked you in for ${shift.client.name} at ${formatTime(now)} via manual override. Reason on file: "${overrideReason}".`,
        type: 'EXCEPTION_OVERRIDE',
      });

      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Caregiver Arrived',
        message: `Caregiver ${shift.caregiver.name} has started the care visit for ${shift.client.name}.`,
        type: 'SHIFT_STARTED',
      });

      const overrideResponse = NextResponse.json({
        success: true,
        shift: updatedShift,
        isLate,
        minutesLate: isLate ? minutesLate : 0,
        message: `Clock-in recorded via administrator override.${isLate ? ` (${minutesLate} mins late logged)` : ''}`,
      });
      if (sessionUser.id === shift.caregiverId) {
        extendSessionForShift(overrideResponse, sessionUser.id, shift.scheduledEnd);
      }
      return overrideResponse;
    }

    // 2. Geofenced validation - the caregiver must be within the client's radius.
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_IN_FAILED_NO_GPS',
        details: `Clock-in refused for ${shift.caregiver.name} at client ${shift.client.name}: device supplied no GPS fix.`,
        outcome: 'FAILURE',
      });
      return NextResponse.json(
        { error: 'Location access is required to clock in. Enable location for this site and try again.' },
        { status: 400 }
      );
    }

    // A fix this coarse cannot prove presence inside a 100m boundary, so treat it
    // as no fix at all rather than letting imprecision stand in for proximity.
    if (typeof accuracy === 'number' && accuracy > MAX_GPS_ACCURACY_METERS) {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_IN_FAILED_GPS_ACCURACY',
        details: `Clock-in refused for ${shift.caregiver.name} at client ${shift.client.name}: GPS accuracy +/-${Math.round(accuracy)}m exceeds the +/-${MAX_GPS_ACCURACY_METERS}m limit.`,
        outcome: 'FAILURE',
      });
      return NextResponse.json(
        {
          error: `Your GPS signal is too weak to confirm you are on site (accurate to +/-${Math.round(accuracy)}m). Move outdoors or nearer a window and try again, or ask your coordinator to clock you in.`,
          accuracy: Math.round(accuracy),
        },
        { status: 400 }
      );
    }

    const distance = computeHaversineDistance(
      latitude,
      longitude,
      shift.client.latitude,
      shift.client.longitude
    );

    if (distance > radius) {
      // Keep the evidence: where they actually were, and that they tried.
      await prisma.caregiverLocationHistory.create({
        data: { shiftId: shift.id, latitude, longitude, timestamp: now },
      }).catch(() => {});

      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_IN_FAILED_GEOFENCE',
        details: `Caregiver ${shift.caregiver.name} failed clock-in for client ${shift.client.name}. Located ${Math.round(distance)}m away (Limit: ${radius}m).`,
        outcome: 'FAILURE',
      });

      await notifyAdmins({
        title: `Out-of-Area Clock-In Attempt - ${shift.client.name}`,
        message: `${shift.caregiver.name} tried to clock in ${Math.round(distance)}m from ${shift.client.name}'s site at ${formatTime(now)} (limit ${radius}m). They cannot start the shift until they are on site, or you clock them in manually.`,
        type: 'EXCEPTION_OVERRIDE',
      });

      return NextResponse.json(
        {
          error: `You are ${Math.round(distance)}m from ${shift.client.name}'s address - you must be within ${radius}m to clock in. Your coordinator has been notified.`,
          distance: Math.round(distance),
          radius,
          allowOverride: false,
        },
        { status: 403 }
      );
    }

    // 3. A late arrival must carry a reason.
    // Asked for only once the caregiver is confirmed on site, so nobody is made
    // to explain a delay on a clock-in that was going to be refused anyway.
    const trimmedLateReason = typeof lateReason === 'string' ? lateReason.trim() : '';
    if (isLate && !trimmedLateReason) {
      return NextResponse.json(
        {
          error: `You are clocking in ${minutesLate} minutes after this shift's scheduled start. Please give a reason for the delay - it is recorded on the client's assessment.`,
          requiresLateReason: true,
          minutesLate,
          scheduledStart: shift.scheduledStart.toISOString(),
          distance: Math.round(distance),
        },
        { status: 400 }
      );
    }

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.IN_PROGRESS,
        actualStart: now,
        clockInLat: latitude,
        clockInLng: longitude,
        clockInDistanceMeter: distance,
        minutesLate: isLate ? minutesLate : null,
        lateReason: isLate ? trimmedLateReason : null,
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
      lateReason: isLate ? trimmedLateReason : null,
      geofenceRadiusMeter: radius,
      geofenceDistanceMeter: Math.round(distance),
      isOverride: false,
      notes: isLate
        ? `Caregiver ${shift.caregiver.name} clocked in ${minutesLate} minutes late for ${shift.client.name} at ${formatTime(now)} (scheduled ${formatTime(shift.scheduledStart)}), verified ${Math.round(distance)}m from site centre. Reason given: "${trimmedLateReason}".`
        : `Caregiver ${shift.caregiver.name} arrived on-site and clocked in for ${shift.client.name} at ${formatTime(now)}, verified ${Math.round(distance)}m from site centre.`,
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
      details: `Caregiver ${shift.caregiver.name} clocked in for client ${shift.client.name} (${Math.round(distance)}m from site centre, limit ${radius}m).${isLate ? ` [LATE: ${minutesLate} mins. Reason: ${trimmedLateReason}]` : ''}`,
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
        title: `Late Arrival - ${shift.client.name}`,
        message: `${shift.caregiver.name} clocked in ${minutesLate} mins late for ${shift.client.name} (scheduled ${formatTime(shift.scheduledStart)}, actual ${formatTime(now)}). Reason: "${trimmedLateReason}". Recorded on the client assessment.`,
        type: 'LATE_ARRIVAL',
      });
    } else {
      await notifyAdmins({
        title: 'Care Visit Started',
        message: `${shift.caregiver.name} clocked in for ${shift.client.name} at ${formatTime(now)} (verified ${Math.round(distance)}m from site centre, limit ${radius}m).`,
        type: 'SHIFT_STARTED',
      });
    }

    const response = NextResponse.json({
      success: true,
      shift: updatedShift,
      distance: Math.round(distance),
      radius,
      isLate,
      minutesLate: isLate ? minutesLate : 0,
      message: isLate
        ? `Clock-in verified ${Math.round(distance)}m from site. ${minutesLate} mins late recorded on the client assessment.`
        : `Clock-in verified ${Math.round(distance)}m from site (limit ${radius}m).`,
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
