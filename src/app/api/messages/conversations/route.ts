import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

// Returns the clients (conversations) the current user is allowed to message
// about: pod clients for caregivers, linked clients for family members, and
// every client for admin/coordinator monitoring access.
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let clients;

    if (sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR') {
      clients = await prisma.client.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    } else if (sessionUser.role === 'CAREGIVER') {
      const pods = await prisma.caregiverPod.findMany({
        where: { caregiverId: sessionUser.id },
        select: { client: { select: { id: true, name: true } } },
      });
      clients = pods.map(p => p.client);
    } else {
      const links = await prisma.linkedFamilyMember.findMany({
        where: { userId: sessionUser.id },
        select: { client: { select: { id: true, name: true } } },
      });
      clients = links.map(l => l.client);
    }

    return NextResponse.json({ conversations: clients });
  } catch (error) {
    console.error('Failed to load conversation list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
