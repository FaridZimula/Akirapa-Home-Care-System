import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { computeHaversineDistance } from '@/lib/geo';
import { ShiftStatus } from '@prisma/client';
import { encrypt } from '@/lib/crypto';

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
    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
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

    // 1. Manual Override Path
    if (isOverride) {
      if (!overrideReason) {
        return NextResponse.json({ error: 'Override reason is required' }, { status: 400 });
      }

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
          isOverrideException: true,
          overrideReason,
          isOvertime,
          overtimeReason: isOvertime ? overtimeReason : null,
          overtimeEvidenceUrl,
        },
      });

      // Audit logs
      await logAudit({
        userId: shift.caregiverId,
        action: 'CLOCK_OUT_OVERRIDE_REQUEST',
        details: `Caregiver ${shift.caregiver.name} requested manual override clock-out for client ${shift.client.name}. Reason: ${overrideReason}`,
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
      }

      return NextResponse.json({
        success: true,
        shift: updatedShift,
        hasRedFlags,
        activeRedFlags,
        activityLogId: activityLog.id,
        message: 'Clock-out submitted via administrator manual override request. Care reports archived securely.',
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
        action: 'CLOCK_OUT_FAILED_GEOFENCE',
        details: `Caregiver ${shift.caregiver.name} failed clock-out for client ${shift.client.name}. Located ${Math.round(distance)}m away (Limit: ${radius}m).`,
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
    }

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
