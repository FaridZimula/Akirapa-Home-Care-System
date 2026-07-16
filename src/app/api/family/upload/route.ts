import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { encrypt } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const { clientId, shiftId, mediaName, mediaType, notes } = await request.json();

    if (!clientId || !mediaName) {
      return NextResponse.json({ error: 'Client ID and Media Name are required' }, { status: 400 });
    }

    // Generate a simulated secure signed URL expiring in 60 minutes
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + 60);

    const mockFileId = `file_${Math.random().toString(36).substring(2, 11)}`;
    const mockSignedUrl = `https://storage.akirapa.local/patient-media/${clientId}/${mockFileId}?token=${Math.random().toString(36).substring(2, 20)}&expires=${Math.round(expiration.getTime() / 1000)}`;

    const logDetails = {
      notes: notes || `Uploaded care media log: ${mediaName}`,
      hasRedFlags: false,
      caregiverName: 'Amara Okafor', // In a full app, this comes from session
      mediaName,
      mediaType: mediaType || 'image/png',
    };

    const encryptedLog = encrypt(JSON.stringify(logDetails));

    // Save activity log with signed URL
    const activityLog = await prisma.activityLog.create({
      data: {
        clientId,
        shiftId: shiftId || null,
        encryptedLog,
        mediaUrls: JSON.stringify([mockSignedUrl]),
      },
    });

    await logAudit({
      userId: shiftId ? 'CAREGIVER_MOCK' : 'FAMILY_MOCK',
      action: 'MEDIA_UPLOAD_SUCCESS',
      details: `Uploaded private care media for client: ${clientId}. Name: ${mediaName}. Signed URL generated.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      activityLog,
      signedUrl: mockSignedUrl,
      expiresAt: expiration.toISOString(),
    });
  } catch (error) {
    console.error('Media upload simulation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
