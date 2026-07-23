import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeHaversineDistance } from '@/lib/geo';
import { ShiftStatus, PodRole } from '@prisma/client';

// Convert a Date object to a time string "HH:MM"
function timeToString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const startStr = searchParams.get('scheduledStart');
    const endStr = searchParams.get('scheduledEnd');

    if (!clientId || !startStr || !endStr) {
      return NextResponse.json({ error: 'Missing required parameters: clientId, scheduledStart, scheduledEnd' }, { status: 400 });
    }

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid start or end date format' }, { status: 400 });
    }

    const dayOfWeek = start.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const startTimeStr = timeToString(start);
    const endTimeStr = timeToString(end);

    // 1. Fetch the client's location (for distance-based ranking)
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { latitude: true, longitude: true },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // 2. Fetch all caregivers
    const caregivers = await prisma.user.findMany({
      where: { role: 'CAREGIVER' },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        latitude: true,
        longitude: true,
        availabilities: {
          where: { dayOfWeek }
        }
      }
    });

    // 3. Fetch the client's pod assignment
    const podAssignments = await prisma.caregiverPod.findMany({
      where: { clientId },
      select: {
        caregiverId: true,
        role: true
      }
    });

    const podMap = new Map<string, PodRole>();
    podAssignments.forEach(p => podMap.set(p.caregiverId, p.role));

    // 4. Fetch overlapping shifts in the proposed time block
    // A shift overlaps if its start/end window intersects the proposed window
    const overlappingShifts = await prisma.shift.findMany({
      where: {
        status: { notIn: [ShiftStatus.DROPPED, ShiftStatus.NO_SHOW] },
        OR: [
          {
            // Case A: Proposed shift starts during an existing shift
            scheduledStart: { lte: start },
            scheduledEnd: { gt: start }
          },
          {
            // Case B: Proposed shift ends during an existing shift
            scheduledStart: { lt: end },
            scheduledEnd: { gte: end }
          },
          {
            // Case C: Proposed shift completely wraps around an existing shift
            scheduledStart: { gte: start },
            scheduledEnd: { lte: end }
          }
        ]
      },
      select: {
        caregiverId: true,
        scheduledStart: true,
        scheduledEnd: true,
        client: { select: { name: true } }
      }
    });

    // Group overlapping shifts by caregiverId
    const conflictsMap = new Map<string, Array<{ start: Date; end: Date; clientName: string }>>();
    overlappingShifts.forEach(s => {
      const current = conflictsMap.get(s.caregiverId) || [];
      current.push({
        start: s.scheduledStart,
        end: s.scheduledEnd,
        clientName: s.client.name
      });
      conflictsMap.set(s.caregiverId, current);
    });

    // 5. Rank each caregiver
    //
    // Distance is the primary signal (nearest caregiver to the client wins), but
    // availability and pod continuity still shift the effective ranking by a
    // bounded amount rather than being pure tie-breakers - a caregiver a few km
    // closer can outrank a further-away primary/available match, but a caregiver
    // on the other side of the city won't beat a nearby one just for being
    // "primary". Bonuses are expressed in km-equivalents:
    const AVAILABLE_BONUS_KM = 20;
    const PRIMARY_POD_BONUS_KM = 15;
    const BACKUP_POD_BONUS_KM = 8;
    const UNKNOWN_LOCATION_PENALTY_KM = 500; // caregivers with no saved location rank behind all known-distance ones

    const suggestions = caregivers.map(cg => {
      const podRole = podMap.get(cg.id) || null;
      const conflicts = conflictsMap.get(cg.id) || [];
      const hasConflict = conflicts.length > 0;

      // Check if caregiver has defined availability that covers this shift
      // A caregiver is available if any of their slots for this day contains the shift window
      const isAvailable = cg.availabilities.some(slot => {
        return startTimeStr >= slot.startTime && endTimeStr <= slot.endTime;
      });

      const hasKnownLocation = cg.latitude != null && cg.longitude != null && client.latitude != null && client.longitude != null;
      const distanceKm = hasKnownLocation
        ? computeHaversineDistance(cg.latitude as number, cg.longitude as number, client.latitude as number, client.longitude as number) / 1000
        : null;

      // Qualitative tier, kept for display/labeling purposes.
      let rank = 4; // Default: Not in pod, not available
      let rankLabel = 'Not in Pod / Availability Unknown';

      if (!hasConflict) {
        if (podRole === PodRole.PRIMARY && isAvailable) {
          rank = 1;
          rankLabel = 'Primary Caregiver (Match)';
        } else if (podRole && isAvailable) {
          rank = 2;
          rankLabel = `${podRole.replace('_', ' ')} Backup Caregiver (Match)`;
        } else if (isAvailable) {
          rank = 3;
          rankLabel = 'Agency Caregiver (Available Match)';
        } else if (podRole) {
          rank = 4;
          rankLabel = `${podRole.replace('_', ' ')} (Outside Availability preference)`;
        }
      } else {
        rank = 5; // Has booking conflict
        rankLabel = `Booking Conflict: Busy with ${conflicts.map(c => c.clientName).join(', ')}`;
      }

      const distanceLabel = distanceKm !== null ? `${distanceKm < 1 ? Math.round(distanceKm * 1000) + 'm' : distanceKm.toFixed(1) + 'km'} away` : 'Location unknown';

      // Composite sort score - lower is better. Conflicted caregivers are always
      // pushed to the bottom regardless of distance, since they physically can't
      // take the shift.
      let sortScore = (distanceKm ?? UNKNOWN_LOCATION_PENALTY_KM);
      if (isAvailable) sortScore -= AVAILABLE_BONUS_KM;
      if (podRole === PodRole.PRIMARY) sortScore -= PRIMARY_POD_BONUS_KM;
      else if (podRole) sortScore -= BACKUP_POD_BONUS_KM;
      if (hasConflict) sortScore += 100000;

      return {
        id: cg.id,
        name: cg.name,
        email: cg.email,
        phoneNumber: cg.phoneNumber,
        podRole,
        isAvailable,
        hasConflict,
        conflicts,
        rank,
        rankLabel: `${rankLabel} — ${distanceLabel}`,
        distanceKm: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
        distanceLabel,
        sortScore,
      };
    });

    // Sort by composite score ascending (nearest + best-matched first)
    suggestions.sort((a, b) => a.sortScore - b.sortScore);

    return NextResponse.json({
      shiftDetails: {
        dayOfWeek,
        startTime: startTimeStr,
        endTime: endTimeStr,
      },
      suggestions,
    });
  } catch (error) {
    console.error('Failed to get caregiver suggestions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
