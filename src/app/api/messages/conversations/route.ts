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

function toParticipants(client: any, admins: any[] = []) {
  return [
    ...admins.map((a: any) => ({ id: a.id, name: a.name, role: a.role })),
    ...client.caregiverPods.map((p: any) => ({ id: p.caregiver.id, name: p.caregiver.name, role: 'CAREGIVER' })),
    ...client.familyMembers.map((f: any) => ({ id: f.user.id, name: f.user.name, role: 'FAMILY_MEMBER' })),
  ];
}

// Returns the clients (conversations) the current user is allowed to message
// about: pod clients for caregivers, linked clients for family members, and
// every client for admin/coordinator monitoring access. Each conversation
// includes the list of people actually in that client's care team thread
// (assigned caregivers + linked family + admins) so viewers can see who's chatting.
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 1. Fetch All System Users (Admins, Coordinators, Caregivers, Family Members)
    const allUsers = await prisma.user.findMany({
      where: { id: { not: sessionUser.id } },
      select: { id: true, name: true, role: true, email: true },
      orderBy: { name: 'asc' },
    });

    // 2. Fetch All Clients
    const allClients = await prisma.client.findMany({
      select: { id: true, name: true, address: true },
      orderBy: { name: 'asc' },
    });

    const conversations: any[] = [];
    const defaultClientId = allClients[0]?.id || null;

    // A. Add All System Users as individual 1-on-1 contact cards
    for (const u of allUsers) {
      let roleLabel = 'User';
      if (u.role === 'ADMIN') roleLabel = 'System Administrator';
      else if (u.role === 'CARE_COORDINATOR') roleLabel = 'Care Coordinator';
      else if (u.role === 'CAREGIVER') roleLabel = 'Caregiver';
      else if (u.role === 'FAMILY_MEMBER') roleLabel = 'Family Member';

      conversations.push({
        id: defaultClientId,
        contactId: u.id,
        name: u.name,
        subtitle: roleLabel,
        roleLabel: u.role,
        participants: [{ id: u.id, name: u.name, role: u.role }],
      });
    }

    // B. Add All Clients as individual Client cards
    for (const c of allClients) {
      conversations.push({
        id: c.id,
        contactId: c.id,
        name: c.name,
        subtitle: `Client (${c.address || 'Home Care Client'})`,
        roleLabel: 'CLIENT',
        participants: [{ id: c.id, name: c.name, role: 'CLIENT' }],
      });
    }

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Failed to load conversation list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
