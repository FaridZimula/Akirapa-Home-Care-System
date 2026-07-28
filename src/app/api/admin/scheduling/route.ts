import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus } from '@prisma/client';

const clientInclude = {
  caregiverPods: {
    include: {
      caregiver: {
        select: { id: true, name: true, email: true, phoneNumber: true },
      },
    },
  },
  familyMembers: {
    include: {
      user: {
        select: { id: true, name: true, email: true, phoneNumber: true },
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
      select: { id: true, name: true, email: true, phoneNumber: true },
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
    const { clientId, caregiverId, scheduledStart, scheduledEnd } = await request.json();

    if (!clientId || !caregiverId || !scheduledStart || !scheduledEnd) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const start = new Date(scheduledStart);
    const end = new Date(scheduledEnd);

    // 1. Pod consistency check
    const podAssignment = await prisma.caregiverPod.findFirst({
      where: { clientId, caregiverId },
    });

    let warningAlert = null;
    if (!podAssignment) {
      warningAlert = `Consistency Warning: Selected caregiver is NOT assigned to the Caregiver Pod for this client. Care outside the primary/secondary pod requires admin override.`;
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
