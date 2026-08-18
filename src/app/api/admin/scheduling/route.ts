import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus, PodRole } from '@prisma/client';

const clientInclude = {
  caregiverPods: {
    include: {
      caregiver: {
        select: { id: true, name: true, email: true, phoneNumber: true, profileMetadata: true },
      },
    },
  },
  familyMembers: {
    include: {
      user: {
        select: { id: true, name: true, email: true, phoneNumber: true, profileMetadata: true },
      },
    },
  },
};

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let clientIds: string[] | null = null; // null = no restriction (admin/coordinator)

    if (sessionUser.role === 'FAMILY_MEMBER') {
      const links = await prisma.linkedFamilyMember.findMany({
        where: { userId: sessionUser.id },
        select: { clientId: true },
      });
      clientIds = links.map(l => l.clientId);
    } else if (sessionUser.role === 'CAREGIVER') {
      const pods = await prisma.caregiverPod.findMany({
        where: { caregiverId: sessionUser.id },
        select: { clientId: true },
      });
      clientIds = pods.map(p => p.clientId);
    }

    const clients = await prisma.client.findMany({
      where: clientIds !== null ? { id: { in: clientIds } } : undefined,
      include: clientInclude,
    });

    const caregivers = await prisma.user.findMany({
      where: { role: 'CAREGIVER' },
      select: { id: true, name: true, email: true, phoneNumber: true, payRate: true, profileMetadata: true },
    });

    const shifts = await prisma.shift.findMany({
      where: sessionUser.role === 'CAREGIVER'
        ? { caregiverId: sessionUser.id }
        : clientIds !== null
          ? { clientId: { in: clientIds } }
          : undefined,
      include: {
        client: true,
        caregiver: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });

    return NextResponse.json({ clients, caregivers, shifts });
  } catch (error) {
    console.error('Failed to load scheduling data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { clientId, caregiverId, scheduledStart, scheduledEnd, autoAssignPod } = await request.json();

    if (!clientId || !caregiverId || !scheduledStart || !scheduledEnd) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const start = new Date(scheduledStart);
    const end = new Date(scheduledEnd);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'Invalid shift start or end time.' }, { status: 400 });
    }

    // 1. Enforce Client Single-Caregiver Rule: Check if the client already has an active shift in this time window
    const existingClientShift = await prisma.shift.findFirst({
      where: {
        clientId,
        status: { notIn: [ShiftStatus.DROPPED, ShiftStatus.NO_SHOW] },
        OR: [
          { scheduledStart: { lte: start }, scheduledEnd: { gt: start } },
          { scheduledStart: { lt: end }, scheduledEnd: { gte: end } },
          { scheduledStart: { gte: start }, scheduledEnd: { lte: end } },
        ],
      },
      include: {
        client: { select: { name: true } },
        caregiver: { select: { name: true } },
      },
    });

    if (existingClientShift) {
      const formatTimeStr = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return NextResponse.json(
        {
          error: `Booking Conflict: Client ${existingClientShift.client.name} is already assigned caregiver ${existingClientShift.caregiver.name} during this shift time window (${formatTimeStr(existingClientShift.scheduledStart)} - ${formatTimeStr(existingClientShift.scheduledEnd)}). A client can only be given one caregiver at a time.`,
        },
        { status: 400 }
      );
    }

    // 2. Check if the Caregiver is already booked for another shift in this time window
    const existingCaregiverShift = await prisma.shift.findFirst({
      where: {
        caregiverId,
        status: { notIn: [ShiftStatus.DROPPED, ShiftStatus.NO_SHOW] },
        OR: [
          { scheduledStart: { lte: start }, scheduledEnd: { gt: start } },
          { scheduledStart: { lt: end }, scheduledEnd: { gte: end } },
          { scheduledStart: { gte: start }, scheduledEnd: { lte: end } },
        ],
      },
      include: {
        client: { select: { name: true } },
        caregiver: { select: { name: true } },
      },
    });

    if (existingCaregiverShift) {
      const formatTimeStr = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return NextResponse.json(
        {
          error: `Booking Conflict: Caregiver ${existingCaregiverShift.caregiver.name} is already scheduled for client ${existingCaregiverShift.client.name} during this shift time window (${formatTimeStr(existingCaregiverShift.scheduledStart)} - ${formatTimeStr(existingCaregiverShift.scheduledEnd)}).`,
        },
        { status: 400 }
      );
    }

    // 3. Pod consistency check
    let podAssignment = await prisma.caregiverPod.findFirst({
      where: { clientId, caregiverId },
    });

    let warningAlert = null;
    if (!podAssignment) {
      if (autoAssignPod) {
        // Find existing pod assignments to pick the best role
        const existingPods = await prisma.caregiverPod.findMany({
          where: { clientId },
          select: { role: true },
        });
        const takenRoles = new Set(existingPods.map(p => p.role));
        let assignRole: PodRole = PodRole.PRIMARY;
        if (takenRoles.has(PodRole.PRIMARY)) {
          if (!takenRoles.has(PodRole.SECONDARY_1)) assignRole = PodRole.SECONDARY_1;
          else if (!takenRoles.has(PodRole.SECONDARY_2)) assignRole = PodRole.SECONDARY_2;
        }

        try {
          podAssignment = await prisma.caregiverPod.create({
            data: { clientId, caregiverId, role: assignRole },
          });
        } catch (e) {
          console.error('Auto pod creation failed:', e);
        }
      }

      if (!podAssignment) {
        warningAlert = `Consistency Warning: Selected caregiver is NOT assigned to the Caregiver Pod for this client. Care outside the primary/secondary pod requires admin override.`;
      }
    }

    // Calculate confirmation deadline: 24 hours before scheduled start
    const confirmationDeadline = new Date(start.getTime() - 24 * 60 * 60 * 1000);

    // Create the shift
    const shift = await prisma.shift.create({
      data: {
        clientId,
        caregiverId,
        scheduledStart: start,
        scheduledEnd: end,
        confirmationDeadline,
        status: ShiftStatus.UNCONFIRMED,
      },
      include: {
        client: true,
        caregiver: true,
      },
    });

    // Write audit log
    await logAudit({
      userId: 'SYSTEM_ADMIN', // In a full app, this would be the logged in admin user ID
      action: 'CREATE_SHIFT',
      details: `Scheduled shift for client ${shift.client.name} with caregiver ${shift.caregiver.name} (Start: ${start.toISOString()})${warningAlert ? ' - WITH POD WARNING' : ''}`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ shift, warningAlert });
  } catch (error) {
    console.error('Failed to create shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
