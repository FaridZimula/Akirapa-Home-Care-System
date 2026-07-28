import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';

// Lets a linked family member view/edit only the "About Me" Q&A section of
// their client's profile - never medical/billing/geofence fields, which stay
// admin-managed via /api/admin/client-profile.
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { clientId, personality, dailyRoutine, preferredCaregiverType, additionalObservations } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const link = await prisma.linkedFamilyMember.findUnique({
      where: { clientId_userId: { clientId, userId: sessionUser.id } },
    });
    if (!link) {
      return NextResponse.json({ error: 'You are not linked to this client' }, { status: 403 });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    let existingMeta: any = {};
    try { existingMeta = client.profileMetadata ? JSON.parse(client.profileMetadata) : {}; } catch {}

    const profileMetadata = {
      ...existingMeta,
      personality: personality ?? existingMeta.personality ?? '',
      dailyRoutine: dailyRoutine ?? existingMeta.dailyRoutine ?? '',
      preferredCaregiverType: preferredCaregiverType ?? existingMeta.preferredCaregiverType ?? '',
      additionalObservations: additionalObservations ?? existingMeta.additionalObservations ?? '',
    };

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: { profileMetadata: JSON.stringify(profileMetadata) },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'UPDATE_CLIENT_ABOUT_ME',
      details: `Family member ${sessionUser.name} updated the "About Me" section for client ${client.name}.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error('Failed to update client About Me:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
