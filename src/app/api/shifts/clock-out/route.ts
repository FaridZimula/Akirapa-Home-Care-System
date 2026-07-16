import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus } from '@prisma/client';
import { encrypt } from '@/lib/crypto';
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
    const { 
      shiftId, 
      completedTaskIds, 
      redFlags, 
      notes, 
      latitude, 
      longitude, 
      isOverride, 
      overrideReason 
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

    if (shift.status !== ShiftStatus.IN_PROGRESS) {
      return NextResponse.json({ error: 'Shift must be in progress to clock out' }, { status: 400 });
    }

    const now = new Date();

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

      // Process clinical red flags
      const activeRedFlags = Object.entries(redFlags || {})
        .filter(([_, value]) => value === true)
        .map(([key, _]) => key);

      const hasRedFlags = activeRedFlags.length > 0;

      // Create encrypted activity log details
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
          mediaUrls: JSON.stringify([]),
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
        details: `Caregiver ${shift.caregiver.name} clocked out for client ${shift.client.name} (via override). Red Flags Detected: ${hasRedFlags ? activeRedFlags.join(', ') : 'None'}.`,
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

      // Notify Admins & Coordinators about clock-out override request
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } },
      });
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          title: 'Clock-Out Override Requested',
          message: `Caregiver ${shift.caregiver.name} requested manual override clock-out for client ${shift.client.name}. Reason: ${overrideReason}`,
          type: 'EXCEPTION_OVERRIDE',
        });
      }

      // Notify Admins and Family about Clinical Red Flags if raised during override
      if (hasRedFlags) {
        for (const admin of admins) {
          await createNotification({
            userId: admin.id,
            title: `CLINICAL ALERT: ${shift.client.name}`,
            message: `Clinical red flags raised for client ${shift.client.name} during shift by caregiver ${shift.caregiver.name}. Flags: ${activeRedFlags.join(', ')}.`,
            type: 'CLINICAL_ALERT',
          });
        }

        const familyMembers = await prisma.linkedFamilyMember.findMany({
          where: { clientId: shift.clientId },
        });
        for (const fam of familyMembers) {
          await createNotification({
            userId: fam.userId,
            title: 'Clinical Concern Logged',
            message: `A care report for ${shift.client.name} has been filed with clinical observations requiring attention. Detail flags: ${activeRedFlags.join(', ')}.`,
            type: 'CLINICAL_ALERT',
          });
        }
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
    };

    const encryptedLog = encrypt(JSON.stringify(logDetails));

    const activityLog = await prisma.activityLog.create({
      data: {
        clientId: shift.clientId,
        shiftId: shift.id,
        encryptedLog,
        mediaUrls: JSON.stringify([]),
      },
    });

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.COMPLETED,
        actualEnd: now,
      },
    });

    await logAudit({
      userId: shift.caregiverId,
      action: 'CLOCK_OUT_SUCCESS',
      details: `Caregiver ${shift.caregiver.name} clocked out successfully for client ${shift.client.name} (${Math.round(distance)}m from site center). Red Flags Detected: ${hasRedFlags ? activeRedFlags.join(', ') : 'None'}.`,
      outcome: 'SUCCESS',
    });

    if (hasRedFlags) {
      await logAudit({
        userId: 'SYSTEM',
        action: 'CLINICAL_RED_FLAG_ALERT',
        details: `CLINICAL ALERT: Red flags raised for client ${shift.client.name} during caregiver ${shift.caregiver.name} shift. Flags: ${activeRedFlags.join(', ')}.`,
        outcome: 'SUCCESS',
      });

      // Notify Admins & Coordinators
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } },
      });
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          title: `CLINICAL ALERT: ${shift.client.name}`,
          message: `Clinical red flags raised for client ${shift.client.name} during shift by caregiver ${shift.caregiver.name}. Flags: ${activeRedFlags.join(', ')}.`,
          type: 'CLINICAL_ALERT',
        });
      }

      // Notify Family Members
      const familyMembers = await prisma.linkedFamilyMember.findMany({
        where: { clientId: shift.clientId },
      });
      for (const fam of familyMembers) {
        await createNotification({
          userId: fam.userId,
          title: 'Clinical Concern Logged',
          message: `A care report for ${shift.client.name} has been filed with clinical observations requiring attention. Detail flags: ${activeRedFlags.join(', ')}.`,
          type: 'CLINICAL_ALERT',
        });
      }
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
