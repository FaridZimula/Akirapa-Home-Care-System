import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { PodRole } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { clientId, caregiverId, role } = await request.json();

    if (!clientId || !caregiverId || !role) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!Object.values(PodRole).includes(role)) {
      return NextResponse.json({ error: 'Invalid pod role' }, { status: 400 });
    }

    // 1. Transaction to delete any existing assignment for this client and role, and insert/update new assignment
    const podAssignment = await prisma.$transaction(async (tx) => {
      // Clear anyone currently in this role for this client
      await tx.caregiverPod.deleteMany({
        where: { clientId, role },
      });

      // Clear any existing assignment of this caregiver to this client (under any role)
      await tx.caregiverPod.deleteMany({
        where: { clientId, caregiverId },
      });

      // Assign the new caregiver to the role
      return await tx.caregiverPod.create({
        data: {
          clientId,
          caregiverId,
          role,
        },
        include: {
          client: true,
          caregiver: true,
        },
      });
    });

    await logAudit({
      userId: 'SYSTEM_ADMIN',
      action: 'UPDATE_POD',
      details: `Assigned caregiver ${podAssignment.caregiver.name} to ${role} role for client ${podAssignment.client.name}`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ podAssignment });
  } catch (error) {
    console.error('Failed to update caregiver pod:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
