import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || (sessionUser.role !== 'ADMIN' && sessionUser.role !== 'CARE_COORDINATOR')) {
      return NextResponse.json({ error: 'Client profile updates are restricted to administrators' }, { status: 403 });
    }

    const { clientId, geofenceRadiusMeter, billingRatePerHour, profileMetadata } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (geofenceRadiusMeter !== undefined) {
      updateData.geofenceRadiusMeter = parseInt(geofenceRadiusMeter);
    }
    if (billingRatePerHour !== undefined) {
      updateData.billingRatePerHour = billingRatePerHour === null ? null : parseFloat(billingRatePerHour);
    }
    if (profileMetadata !== undefined) {
      updateData.profileMetadata = typeof profileMetadata === 'string' ? profileMetadata : JSON.stringify(profileMetadata);
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: updateData,
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'UPDATE_CLIENT_PROFILE_SETTINGS',
      details: `Updated profile metadata and geofence radius (${updatedClient.geofenceRadiusMeter}m) for client: ${updatedClient.name}`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error('Failed to update client profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
