import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { computeHaversineDistance } from '@/lib/geo';
import { ShiftStatus } from '@prisma/client';
import { encrypt } from '@/lib/crypto';
import { createNotification, notifyAdmins, notifyClientFamily } from '@/lib/notifications';
import { formatTime } from '@/lib/dateFormat';
import {
  GEOFENCE_DEFAULT_RADIUS_METERS,
  MAX_GPS_ACCURACY_METERS,
} from '@/lib/attendance';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const {
      shiftId,
      completedTaskIds,
      redFlags,
      notes,
      latitude,
      longitude,
      accuracy,
      isOverride,
      overrideReason,
      mediaFiles,
      handover,
      overtimeReason,
      overtimeEvidenceFile,
    } = await request.json();

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
        action: 'CLOCK_OUT_FORBIDDEN',
        details: `User ${sessionUser.email} attempted to clock out a shift not assigned to them (shift ${shiftId}).`,
        outcome: 'FAILURE',
      });
      return NextResponse.json({ error: 'You are not authorized to act on this shift' }, { status: 403 });
    }

    if (shift.status !== ShiftStatus.IN_PROGRESS) {
      return NextResponse.json({ error: 'Shift must be in progress to clock out' }, { status: 400 });
    }

    const now = new Date();

    // Overtime is determined server-side against the shift's own schedule, not
    // trusted from the client, but the justification text itself is user input.
    const isOvertime = now.getTime() > new Date(shift.scheduledEnd).getTime();
    if (isOvertime && !overtimeReason) {
      return NextResponse.json({ error: 'An overtime reason is required since this shift is running past its scheduled end time.' }, { status: 400 });
    }

    let overtimeEvidenceUrl: string | null = null;
    if (isOvertime && overtimeEvidenceFile) {
      const mockFileId = `file_${Math.random().toString(36).substring(2, 11)}`;
      overtimeEvidenceUrl = `https://storage.akirapa.local/overtime-evidence/${shift.id}/${mockFileId}?token=${Math.random().toString(36).substring(2, 20)}&expires=1893456000`;
    }

    // Process media upload simulation
    const generatedUrls: string[] = [];
    if (mediaFiles && Array.isArray(mediaFiles)) {
      for (const file of mediaFiles) {
        const mockFileId = `file_${Math.random().toString(36).substring(2, 11)}`;
        const mockSignedUrl = `https://storage.akirapa.local/patient-media/${shift.clientId}/${mockFileId}?token=${Math.random().toString(36).substring(2, 20)}&expires=1893456000`;
        generatedUrls.push(mockSignedUrl);
      }
    }

    const activeRedFlags = Object.entries(redFlags || {})
      .filter(([_, value]) => value === true)
      .map(([key, _]) => key);

    const hasRedFlags = activeRedFlags.length > 0;

    const logDetails = {
      notes: notes || 'No notes provided',
      redFlags: redFlags || {},
      hasRedFlags,
      activeRedFlags,
      completedTaskCount: completedTaskIds?.length || 0,
      caregiverName: shift.caregiver.name,
      mediaUrls: generatedUrls,
      mediaFiles: mediaFiles || [],
      handover: handover || null,
      isOvertime,
      overtimeReason: isOvertime ? overtimeReason : null,
    };

    const encryptedLog = encrypt(JSON.stringify(logDetails));

    // 1. Administrator override. Mirrors clock-in: a caregiver cannot clear their
    // own geofence exception, so an out-of-area clock-out is closed off by a
    // coordinator, on the record, with their user id attached.
    if (isOverride) {
      if (!isSupervisor) {
        await logAudit({
          userId: sessionUser.id,
          action: 'CLOCK_OUT_OVERRIDE_DENIED',
          details: `Caregiver ${sessionUser.email} attempted to self-override the geofence to clock out of shift ${shiftId}. Override requires an administrator.`,
          outcome: 'FAILURE',
        });
        return NextResponse.json(
          { error: 'Only an administrator can override the geofence. Contact your coordinator to be clocked out manually.' },
          { status: 403 }
        );
      }

      if (!overrideReason) {
        return NextResponse.json({ error: 'Override reason is required' }, { status: 400 });
      }

      const overrideDistance =
        typeof latitude === 'number' && typeof longitude === 'number'
          ? computeHaversineDistance(latitude, longitude, shift.client.latitude, shift.client.longitude)
          : null;

      // Mark completed tasks
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

      // Save activity log
      const activityLog = await prisma.activityLog.create({
        data: {
          clientId: shift.clientId,
          shiftId: shift.id,
          encryptedLog,
          mediaUrls: JSON.stringify(generatedUrls),
        },
      });

      // Update shift status to COMPLETED
      const updatedShift = await prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.COMPLETED,
          actualEnd: now,
          clockOutLat: typeof latitude === 'number' ? latitude : null,
          clockOutLng: typeof longitude === 'number' ? longitude : null,
          clockOutDistanceMeter: overrideDistance,
          isOverrideException: true,
          overrideReason,
          overrideApprovedBy: sessionUser.id,
          isOvertime,
          overtimeReason: isOvertime ? overtimeReason : null,
          overtimeEvidenceUrl,
        },
      });

      // Audit logs
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_OUT_ADMIN_OVERRIDE',
        details: `Admin ${sessionUser.email} manually clocked out caregiver ${shift.caregiver.name} for client ${shift.client.name}.${overrideDistance === null ? ' No GPS fix supplied.' : ` Device was ${Math.round(overrideDistance)}m from site.`} Reason: ${overrideReason}`,
        outcome: 'SUCCESS',
      });

      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_OUT_SUCCESS',
        details: `Caregiver ${shift.caregiver.name} clocked out for client ${shift.client.name} (via override). Red Flags Detected: ${hasRedFlags ? activeRedFlags.join(', ') : 'None'}.${isOvertime ? ` Overtime reason: ${overtimeReason}` : ''}`,
        outcome: 'SUCCESS',
      });

      if (hasRedFlags) {
        await logAudit({
          userId: 'SYSTEM',
          action: 'CLINICAL_RED_FLAG_ALERT',
          details: `CLINICAL ALERT: Red flags raised for client ${shift.client.name} during caregiver ${shift.caregiver.name} shift. Flags: ${activeRedFlags.join(', ')}.`,
          outcome: 'SUCCESS',
        });

        // NOTIFY ADMINS & CLIENT FAMILY OF CLINICAL RED FLAGS
        await notifyAdmins({
          title: `🚨 Clinical Alert — ${shift.client.name}`,
          message: `Caregiver ${shift.caregiver.name} reported red flags for ${shift.client.name}: ${activeRedFlags.join(', ')}. Details: ${notes || 'See care report.'}`,
          type: 'CLINICAL_ALERT',
        });

        await notifyClientFamily({
          clientId: shift.clientId,
          title: `🚨 Health Observation Alert — ${shift.client.name}`,
          message: `Observations were noted during ${shift.client.name}'s care visit by ${shift.caregiver.name}: ${activeRedFlags.join(', ')}. Check your activity feed for full notes.`,
          type: 'CLINICAL_ALERT',
        });
      }

      // Notify Admins of Override & Overtime if applicable
      await notifyAdmins({
        title: 'Clock-Out Geofence Override',
        message: `${sessionUser.name} manually clocked out ${shift.caregiver.name} from ${shift.client.name}'s visit.${overrideDistance === null ? '' : ` Device was ${Math.round(overrideDistance)}m from site.`} Reason: "${overrideReason}".${isOvertime ? ` Overtime: ${overtimeReason}` : ''}`,
        type: 'EXCEPTION_OVERRIDE',
        excludeUserId: sessionUser.id,
      });

      await createNotification({
        userId: shift.caregiverId,
        title: 'Clocked Out By Administrator',
        message: `${sessionUser.name} clocked you out of ${shift.client.name}'s visit at ${formatTime(now)} via manual override. Reason on file: "${overrideReason}".`,
        type: 'EXCEPTION_OVERRIDE',
      });

      // Notify Client / Family of Shift Completion
      await notifyClientFamily({
        clientId: shift.clientId,
        title: 'Care Visit Completed',
        message: `Caregiver ${shift.caregiver.name} completed today's visit for ${shift.client.name} (${logDetails.completedTaskCount} tasks completed). Activity log is available in your portal.`,
        type: 'SHIFT_COMPLETED',
      });

      return NextResponse.json({
        success: true,
        shift: updatedShift,
        hasRedFlags,
        activeRedFlags,
        activityLogId: activityLog.id,
        message: 'Clock-out submitted via administrator manual override request. Care reports archived securely.',
      });
    }

    // 2. Geofenced validation - the caregiver must still be at the client's site.
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_OUT_FAILED_NO_GPS',
        details: `Clock-out refused for ${shift.caregiver.name} at client ${shift.client.name}: device supplied no GPS fix.`,
        outcome: 'FAILURE',
      });
      return NextResponse.json(
        { error: 'Location access is required to clock out. Enable location for this site and try again.' },
        { status: 400 }
      );
    }

    if (typeof accuracy === 'number' && accuracy > MAX_GPS_ACCURACY_METERS) {
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_OUT_FAILED_GPS_ACCURACY',
        details: `Clock-out refused for ${shift.caregiver.name} at client ${shift.client.name}: GPS accuracy +/-${Math.round(accuracy)}m exceeds the +/-${MAX_GPS_ACCURACY_METERS}m limit.`,
        outcome: 'FAILURE',
      });
      return NextResponse.json(
        {
          error: `Your GPS signal is too weak to confirm you are still on site (accurate to +/-${Math.round(accuracy)}m). Move outdoors or nearer a window and try again, or ask your coordinator to clock you out.`,
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

    const radius = shift.client.geofenceRadiusMeter || GEOFENCE_DEFAULT_RADIUS_METERS;

    if (distance > radius) {
      await prisma.caregiverLocationHistory.create({
        data: { shiftId: shift.id, latitude, longitude, timestamp: now },
      }).catch(() => {});

      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_OUT_FAILED_GEOFENCE',
        details: `Caregiver ${shift.caregiver.name} failed clock-out for client ${shift.client.name}. Located ${Math.round(distance)}m away (Limit: ${radius}m).`,
        outcome: 'FAILURE',
      });

      await notifyAdmins({
        title: `Out-of-Area Clock-Out Attempt - ${shift.client.name}`,
        message: `${shift.caregiver.name} tried to clock out ${Math.round(distance)}m from ${shift.client.name}'s site at ${formatTime(now)} (limit ${radius}m). The shift is still open - clock them out manually if they have genuinely left.`,
        type: 'EXCEPTION_OVERRIDE',
      });

      return NextResponse.json(
        {
          error: `You are ${Math.round(distance)}m from ${shift.client.name}'s address - you must be within ${radius}m to clock out. Your coordinator has been notified.`,
          distance: Math.round(distance),
          radius,
          allowOverride: false,
        },
        { status: 403 }
      );
    }

    // Valid clock-out (inside geofence)
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

    const activityLog = await prisma.activityLog.create({
      data: {
        clientId: shift.clientId,
        shiftId: shift.id,
        encryptedLog,
        mediaUrls: JSON.stringify(generatedUrls),
      },
    });

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.COMPLETED,
        actualEnd: now,
        clockOutLat: latitude,
        clockOutLng: longitude,
        clockOutDistanceMeter: distance,
        isOvertime,
        overtimeReason: isOvertime ? overtimeReason : null,
        overtimeEvidenceUrl,
      },
    });

    await logAudit({
      userId: shift.caregiverId,
      action: 'CLOCK_OUT_SUCCESS',
      details: `Caregiver ${shift.caregiver.name} clocked out successfully for client ${shift.client.name} (${Math.round(distance)}m from site center). Red Flags Detected: ${hasRedFlags ? activeRedFlags.join(', ') : 'None'}.${isOvertime ? ` Overtime reason: ${overtimeReason}` : ''}`,
      outcome: 'SUCCESS',
    });

    if (hasRedFlags) {
      await logAudit({
        userId: 'SYSTEM',
        action: 'CLINICAL_RED_FLAG_ALERT',
        details: `CLINICAL ALERT: Red flags raised for client ${shift.client.name} during caregiver ${shift.caregiver.name} shift. Flags: ${activeRedFlags.join(', ')}.`,
        outcome: 'SUCCESS',
      });

      // NOTIFY ADMINS & CLIENT FAMILY OF CLINICAL RED FLAGS
      await notifyAdmins({
        title: `🚨 Clinical Alert — ${shift.client.name}`,
        message: `Caregiver ${shift.caregiver.name} reported red flags for ${shift.client.name}: ${activeRedFlags.join(', ')}. Notes: ${notes || 'See care report.'}`,
        type: 'CLINICAL_ALERT',
      });

      await notifyClientFamily({
        clientId: shift.clientId,
        title: `🚨 Health Observation Alert — ${shift.client.name}`,
        message: `Observations were noted during ${shift.client.name}'s care visit by ${shift.caregiver.name}: ${activeRedFlags.join(', ')}. Check your activity feed for full notes.`,
        type: 'CLINICAL_ALERT',
      });
    }

    if (isOvertime) {
      await notifyAdmins({
        title: `Overtime Logged — ${shift.client.name}`,
        message: `Caregiver ${shift.caregiver.name} logged overtime for ${shift.client.name}. Reason: "${overtimeReason}".`,
        type: 'SYSTEM_ALERT',
      });
    }

    // Notify Client / Family of Shift Completion
    await notifyClientFamily({
      clientId: shift.clientId,
      title: 'Care Visit Completed',
      message: `Caregiver ${shift.caregiver.name} completed the visit for ${shift.client.name} (${logDetails.completedTaskCount} tasks completed). Full notes are available in your portal.`,
      type: 'SHIFT_COMPLETED',
    });

    // Notify Admins of Shift Completion
    await notifyAdmins({
      title: 'Shift Completed',
      message: `Caregiver ${shift.caregiver.name} completed shift for ${shift.client.name} (${logDetails.completedTaskCount} tasks).`,
      type: 'SHIFT_COMPLETED',
    });

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
      hasRedFlags,
      activeRedFlags,
      activityLogId: activityLog.id,
      distance: Math.round(distance),
      message: 'Clocked out successfully. Care reports archived securely.',
    });
  } catch (error) {
    console.error('Clock-out error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
