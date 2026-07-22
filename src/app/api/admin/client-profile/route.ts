import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { clientId, geofenceRadiusMeter, profileMetadata } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (geofenceRadiusMeter !== undefined) {
      updateData.geofenceRadiusMeter = parseInt(geofenceRadiusMeter);
    }
    if (profileMetadata !== undefined) {
      updateData.profileMetadata = typeof profileMetadata === 'string' ? profileMetadata : JSON.stringify(profileMetadata);
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: updateData,
    });

    await logAudit({
      userId: 'ADMIN',
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
