import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

const clientWithParticipants = {
  select: {
    id: true,
    name: true,
    caregiverPods: {
      select: { caregiver: { select: { id: true, name: true } } },
    },
    familyMembers: {
      select: { user: { select: { id: true, name: true } } },
    },
  },
};

function toParticipants(client: any) {
  return [
    ...client.caregiverPods.map((p: any) => ({ id: p.caregiver.id, name: p.caregiver.name, role: 'CAREGIVER' })),
    ...client.familyMembers.map((f: any) => ({ id: f.user.id, name: f.user.name, role: 'FAMILY_MEMBER' })),
  ];
}

// Returns the clients (conversations) the current user is allowed to message
// about: pod clients for caregivers, linked clients for family members, and
// every client for admin/coordinator monitoring access. Each conversation
// includes the list of people actually in that client's care team thread
// (assigned caregivers + linked family) so viewers can see who's chatting.
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let clients: any[];

    if (sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR') {
      clients = await prisma.client.findMany({
        ...clientWithParticipants,
        orderBy: { name: 'asc' },
      });
    } else if (sessionUser.role === 'CAREGIVER') {
      const pods = await prisma.caregiverPod.findMany({
        where: { caregiverId: sessionUser.id },
        select: { client: clientWithParticipants },
      });
      clients = pods.map(p => p.client);
    } else {
      const links = await prisma.linkedFamilyMember.findMany({
        where: { userId: sessionUser.id },
        select: { client: clientWithParticipants },
      });
      clients = links.map(l => l.client);
    }

    const conversations = clients.map(c => ({
      id: c.id,
      name: c.name,
      participants: toParticipants(c),
    }));

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Failed to load conversation list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
