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

    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } },
      select: { id: true, name: true, role: true },
    });

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

    const conversations: any[] = [];
    const addedIds = new Set<string>();

    // 1. Separate Admins & Care Coordinators
    for (const admin of admins) {
      if (admin.id === sessionUser.id) continue;
      if (!addedIds.has(admin.id)) {
        addedIds.add(admin.id);
        conversations.push({
          id: clients[0]?.id || 'admin',
          contactId: admin.id,
          name: admin.name,
          subtitle: admin.role === 'ADMIN' ? 'System Administrator' : 'Care Coordinator',
          participants: [{ id: admin.id, name: admin.name, role: admin.role }],
        });
      }
    }

    // 2. Separate Caregivers
    for (const c of clients) {
      for (const pod of c.caregiverPods) {
        const cg = pod.caregiver;
        if (cg.id === sessionUser.id) continue;
        if (!addedIds.has(cg.id)) {
          addedIds.add(cg.id);
          conversations.push({
            id: c.id,
            contactId: cg.id,
            name: cg.name,
            subtitle: `Caregiver · ${c.name}`,
            participants: [{ id: cg.id, name: cg.name, role: 'CAREGIVER' }],
          });
        }
      }
      // 3. Separate Family Members
      for (const fm of c.familyMembers) {
        const fUser = fm.user;
        if (fUser.id === sessionUser.id) continue;
        if (!addedIds.has(fUser.id)) {
          addedIds.add(fUser.id);
          conversations.push({
            id: c.id,
            contactId: fUser.id,
            name: fUser.name,
            subtitle: `Family Member · ${c.name}`,
            participants: [{ id: fUser.id, name: fUser.name, role: 'FAMILY_MEMBER' }],
          });
        }
      }
    }

    // 4. Client Care Team channels
    for (const c of clients) {
      conversations.push({
        id: c.id,
        contactId: c.id,
        name: c.name,
        subtitle: `Client Care Team (${c.caregiverPods.length} caregiver(s))`,
        participants: [
          ...admins.map(a => ({ id: a.id, name: a.name, role: a.role })),
          ...c.caregiverPods.map(p => ({ id: p.caregiver.id, name: p.caregiver.name, role: 'CAREGIVER' })),
          ...c.familyMembers.map(f => ({ id: f.user.id, name: f.user.name, role: 'FAMILY_MEMBER' })),
        ],
      });
    }

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Failed to load conversation list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
