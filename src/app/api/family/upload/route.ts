import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { encrypt } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const { clientId, shiftId, mediaName, mediaType, notes, mediaFiles, redFlags, wellness } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    let filesList = [];
    if (mediaFiles && Array.isArray(mediaFiles)) {
      filesList = mediaFiles;
    } else if (mediaName) {
      filesList = [{ name: mediaName, type: mediaType || 'image/png' }];
    }

    const generatedUrls: string[] = [];
    const filesMetadata = [];
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + 60);

    for (const file of filesList) {
      const mockFileId = `file_${Math.random().toString(36).substring(2, 11)}`;
      const isVideo = file.type?.startsWith('video/') || file.name?.toLowerCase().endsWith('.mp4') || file.name?.toLowerCase().endsWith('.mov');
      const isAudio = file.type?.startsWith('audio/') || file.name?.toLowerCase().endsWith('.mp3') || file.name?.toLowerCase().endsWith('.wav') || file.name?.toLowerCase().endsWith('.m4a') || file.name?.toLowerCase().endsWith('.ogg') || file.name?.toLowerCase().endsWith('.webm');
      const ext = isVideo ? 'mp4' : isAudio ? 'mp3' : 'png';
      
      const mockSignedUrl = `https://storage.akirapa.local/patient-media/${clientId}/${mockFileId}.${ext}?token=${Math.random().toString(36).substring(2, 20)}&expires=${Math.round(expiration.getTime() / 1000)}`;
      generatedUrls.push(mockSignedUrl);
      filesMetadata.push({
        name: file.name,
        type: file.type || (isVideo ? 'video/mp4' : isAudio ? 'audio/mp3' : 'image/png'),
        url: mockSignedUrl
      });
    }

    // Determine caregiver name dynamically from shift if possible
    let caregiverName = 'Amara Okafor';
    let auditUserId = 'FAMILY_MOCK';
    
    if (shiftId) {
      const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        include: { caregiver: true },
      });
      if (shift) {
        auditUserId = shift.caregiverId;
        if (shift.caregiver) {
          caregiverName = shift.caregiver.name;
        }
      }
    }

    // Process clinical red flags
    const activeRedFlags = Object.entries(redFlags || {})
      .filter(([_, value]) => value === true)
      .map(([key, _]) => key);

    const hasRedFlags = activeRedFlags.length > 0;

    const logDetails = {
      notes: notes || (filesMetadata.length > 0 ? `Uploaded care media update: ${filesMetadata.map(f => f.name).join(', ')}` : 'Daily observation update.'),
      hasRedFlags,
      activeRedFlags,
      redFlags: redFlags || {},
      caregiverName,
      mediaFiles: filesMetadata,
      mediaName: filesMetadata[0]?.name || null,
      mediaType: filesMetadata[0]?.type || null,
      wellness: wellness || null,
    };

    const encryptedLog = encrypt(JSON.stringify(logDetails));

    // Save activity log with signed URLs
    const activityLog = await prisma.activityLog.create({
      data: {
        clientId,
        shiftId: shiftId || null,
        encryptedLog,
        mediaUrls: JSON.stringify(generatedUrls),
      },
    });

    await logAudit({
      userId: auditUserId,
      action: 'MEDIA_UPLOAD_SUCCESS',
      details: `Uploaded ${filesMetadata.length} private care media files for client: ${clientId}. Signed URLs generated.`,
      outcome: 'SUCCESS',
    });

    if (hasRedFlags) {
      // Find client name to make audit alert descriptive
      let clientName = 'Sarah Jenkins';
      if (clientId) {
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (client) clientName = client.name;
      }

      await logAudit({
        userId: 'SYSTEM',
        action: 'CLINICAL_RED_FLAG_ALERT',
        details: `CLINICAL ALERT: Red flags raised for client ${clientName} during caregiver ${caregiverName} update. Flags: ${activeRedFlags.join(', ')}.`,
        outcome: 'SUCCESS',
      });
    }

    return NextResponse.json({
      success: true,
      activityLog,
      signedUrls: generatedUrls,
      files: filesMetadata,
      expiresAt: expiration.toISOString(),
    });
  } catch (error) {
    console.error('Media upload simulation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
