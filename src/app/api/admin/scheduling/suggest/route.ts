import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

    // 1. Fetch all caregivers
    const caregivers = await prisma.user.findMany({
      where: { role: 'CAREGIVER' },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        availabilities: {
          where: { dayOfWeek }
        }
      }
    });

    // 2. Fetch the client's pod assignment
    const podAssignments = await prisma.caregiverPod.findMany({
      where: { clientId },
      select: {
        caregiverId: true,
        role: true
      }
    });

    const podMap = new Map<string, PodRole>();
    podAssignments.forEach(p => podMap.set(p.caregiverId, p.role));

    // 3. Fetch overlapping shifts in the proposed time block
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

    // 4. Rank each caregiver
    const suggestions = caregivers.map(cg => {
      const podRole = podMap.get(cg.id) || null;
      const conflicts = conflictsMap.get(cg.id) || [];
      const hasConflict = conflicts.length > 0;

      // Check if caregiver has defined availability that covers this shift
      // A caregiver is available if any of their slots for this day contains the shift window
      const isAvailable = cg.availabilities.some(slot => {
        return startTimeStr >= slot.startTime && endTimeStr <= slot.endTime;
      });

      // Calculate score for sorting
      // Lower score is better (Ranks 1 to 5)
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
        rankLabel,
      };
    });

    // Sort by rank ascending
    suggestions.sort((a, b) => a.rank - b.rank);

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
