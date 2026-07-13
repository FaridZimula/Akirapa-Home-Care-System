import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ShiftStatus } from '@prisma/client';

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      include: {
        caregiverPods: {
          include: {
            caregiver: {
              select: { id: true, name: true, email: true, phoneNumber: true },
            },
          },
        },
      },
    });

    const caregivers = await prisma.user.findMany({
      where: { role: 'CAREGIVER' },
      select: { id: true, name: true, email: true, phoneNumber: true },
    });

    const shifts = await prisma.shift.findMany({
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
