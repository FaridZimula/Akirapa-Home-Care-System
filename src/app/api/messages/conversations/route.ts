import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

// Returns the conversations the current user is allowed to message.
// FAMILY_MEMBER → only system admins + caregivers assigned to their loved one
// CAREGIVER → admins + clients in their pod + family members of those clients
// ADMIN / CARE_COORDINATOR → all users (full oversight)
export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const conversations: any[] = [];

    // ─── FAMILY MEMBER: restrict to admins + assigned caregiver(s) ───
    if (sessionUser.role === 'FAMILY_MEMBER') {
      // 1. Get all system admins
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      });

      // 2. Find the client(s) this family member is linked to
      const linkedClients = await prisma.client.findMany({
        where: {
          familyMembers: {
            some: { userId: sessionUser.id },
          },
        },
        select: {
          id: true,
          name: true,
          address: true,
          caregiverPods: {
            select: {
              caregiver: { select: { id: true, name: true, role: true } },
            },
          },
          // Also look for directly assigned caregivers via shifts
          shifts: {
            where: {
              status: { in: ['CONFIRMED', 'IN_PROGRESS', 'UNCONFIRMED'] },
            },
            select: {
              caregiver: { select: { id: true, name: true, role: true } },
            },
            distinct: ['caregiverId'],
            take: 20,
          },
        },
        orderBy: { name: 'asc' },
      });

      const defaultClientId = linkedClients[0]?.id || null;

      // 3. Add admins/coordinators
      for (const admin of admins) {
        conversations.push({
          id: defaultClientId,
          contactId: admin.id,
          name: admin.name,
          subtitle: admin.role === 'ADMIN' ? 'System Administrator' : 'Care Coordinator',
          roleLabel: admin.role,
          badgeType: 'admin',
          participants: [{ id: admin.id, name: admin.name, role: admin.role }],
        });
      }

      // 4. Add caregivers assigned to their loved one(s) — deduplicated
      const addedCaregiverIds = new Set<string>();
      for (const client of linkedClients) {
        // From caregiver pods
        for (const pod of client.caregiverPods) {
          const cg = pod.caregiver;
          if (!addedCaregiverIds.has(cg.id)) {
            addedCaregiverIds.add(cg.id);
            conversations.push({
              id: client.id,
              contactId: cg.id,
              name: cg.name,
              subtitle: `Caregiver — ${client.name}'s Care Team`,
              roleLabel: 'CAREGIVER',
              badgeType: 'caregiver',
              linkedClientName: client.name,
              participants: [{ id: cg.id, name: cg.name, role: 'CAREGIVER' }],
            });
          }
        }
        // From active/upcoming shifts
        for (const shift of client.shifts) {
          const cg = shift.caregiver;
          if (cg && !addedCaregiverIds.has(cg.id)) {
            addedCaregiverIds.add(cg.id);
            conversations.push({
              id: client.id,
              contactId: cg.id,
              name: cg.name,
              subtitle: `Caregiver — Assigned to ${client.name}`,
              roleLabel: 'CAREGIVER',
              badgeType: 'caregiver',
              linkedClientName: client.name,
              participants: [{ id: cg.id, name: cg.name, role: 'CAREGIVER' }],
            });
          }
        }
      }

          // Compute unreadCount for each contact
    for (const c of conversations) {
      if (c.contactId) {
        try {
          const unreadCount = await prisma.message.count({
            where: {
              senderId: c.contactId,
              recipientId: sessionUser.id,
              isRead: false,
            },
          });
          c.unreadCount = unreadCount;
        } catch (e) {
          c.unreadCount = 0;
        }
      } else {
        c.unreadCount = 0;
      }
    }

    return NextResponse.json({ conversations });
    }

    // ─── CAREGIVER: admins + clients in their pod + family members of those clients ───
    if (sessionUser.role === 'CAREGIVER') {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      });

      const podClients = await prisma.client.findMany({
        where: {
          caregiverPods: { some: { caregiverId: sessionUser.id } },
        },
        select: {
          id: true,
          name: true,
          address: true,
          familyMembers: {
            select: { user: { select: { id: true, name: true, role: true } } },
          },
        },
        orderBy: { name: 'asc' },
      });

      const defaultClientId = podClients[0]?.id || null;

      // Add admins
      for (const admin of admins) {
        conversations.push({
          id: defaultClientId,
          contactId: admin.id,
          name: admin.name,
          subtitle: admin.role === 'ADMIN' ? 'System Administrator' : 'Care Coordinator',
          roleLabel: admin.role,
          badgeType: 'admin',
          participants: [{ id: admin.id, name: admin.name, role: admin.role }],
        });
      }

      // Add family members of pod clients
      const addedFamilyIds = new Set<string>();
      for (const client of podClients) {
        for (const fm of client.familyMembers) {
          const fmUser = fm.user;
          if (!addedFamilyIds.has(fmUser.id)) {
            addedFamilyIds.add(fmUser.id);
            conversations.push({
              id: client.id,
              contactId: fmUser.id,
              name: fmUser.name,
              subtitle: `Family of ${client.name}`,
              roleLabel: 'FAMILY_MEMBER',
              badgeType: 'family',
              participants: [{ id: fmUser.id, name: fmUser.name, role: 'FAMILY_MEMBER' }],
            });
          }
        }
      }

      return NextResponse.json({ conversations });
    }

    // ─── ADMIN / CARE_COORDINATOR: see all users ───
    const allUsers = await prisma.user.findMany({
      where: { id: { not: sessionUser.id } },
      select: { id: true, name: true, role: true, email: true },
      orderBy: { name: 'asc' },
    });

    const allClients = await prisma.client.findMany({
      select: { id: true, name: true, address: true },
      orderBy: { name: 'asc' },
    });

    const defaultClientId = allClients[0]?.id || null;

    for (const u of allUsers) {
      let roleLabel = 'User';
      if (u.role === 'ADMIN') roleLabel = 'System Administrator';
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
