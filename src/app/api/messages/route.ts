import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import { getSessionUser, SessionUser } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';

async function isDirectParticipant(sessionUser: SessionUser, clientId: string): Promise<boolean> {
  if (sessionUser.role === 'CAREGIVER') {
    const pod = await prisma.caregiverPod.findUnique({
      where: { clientId_caregiverId: { clientId, caregiverId: sessionUser.id } },
    });
    return !!pod;
  }
  if (sessionUser.role === 'FAMILY_MEMBER') {
    const link = await prisma.linkedFamilyMember.findUnique({
      where: { clientId_userId: { clientId, userId: sessionUser.id } },
    });
    return !!link;
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
    const directAccess = await isDirectParticipant(sessionUser, clientId);

    if (!isSupervisor && !directAccess) {
      return NextResponse.json({ error: 'You do not have access to this conversation' }, { status: 403 });
    }

    // Admin/coordinator viewing a conversation they're not a direct participant
    // in counts as monitoring access - log it for transparency.
    if (isSupervisor && !directAccess) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
      await logAudit({
        userId: sessionUser.id,
        action: 'MESSAGE_MONITORING_ACCESS',
        details: `${sessionUser.role} ${sessionUser.email} viewed the caregiver/family message thread for client ${client?.name || clientId}.`,
        outcome: 'SUCCESS',
      });
    }

    const messages = await prisma.message.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    const decrypted = messages.map(m => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRole: m.sender.role,
      text: m.encryptedText ? decrypt(m.encryptedText) : null,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      mediaName: m.mediaName,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({ messages: decrypted });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { clientId, text, mediaFile } = await request.json();
    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }
    if (!text?.trim() && !mediaFile) {
      return NextResponse.json({ error: 'Message must include text or an attachment' }, { status: 400 });
    }

    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
    const directAccess = await isDirectParticipant(sessionUser, clientId);
    if (!isSupervisor && !directAccess) {
      return NextResponse.json({ error: 'You do not have access to this conversation' }, { status: 403 });
    }

    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let mediaName: string | null = null;
    if (mediaFile) {
      const mockFileId = `file_${Math.random().toString(36).substring(2, 11)}`;
      const isVideo = mediaFile.type?.startsWith('video/');
      const isAudio = mediaFile.type?.startsWith('audio/');
      mediaType = isVideo ? 'video' : isAudio ? 'audio' : 'image';
      const ext = isVideo ? 'mp4' : isAudio ? 'mp3' : 'png';
      mediaUrl = `https://storage.akirapa.local/messages/${clientId}/${mockFileId}.${ext}?token=${Math.random().toString(36).substring(2, 20)}&expires=1893456000`;
      mediaName = mediaFile.name || null;
    }

    const message = await prisma.message.create({
      data: {
        clientId,
        senderId: sessionUser.id,
        encryptedText: text?.trim() ? encrypt(text.trim()) : null,
        mediaUrl,
        mediaType,
        mediaName,
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'MESSAGE_SENT',
      details: `${sessionUser.role} ${sessionUser.email} sent a message${mediaUrl ? ' with attachment' : ''} in the conversation for client ${clientId}.`,
      outcome: 'SUCCESS',
    });

    // Notify every other participant (pod caregivers + linked family) except the sender.
    const pods = await prisma.caregiverPod.findMany({ where: { clientId }, select: { caregiverId: true } });
    const links = await prisma.linkedFamilyMember.findMany({ where: { clientId }, select: { userId: true } });
    const recipientIds = new Set<string>([
      ...pods.map(p => p.caregiverId),
      ...links.map(l => l.userId),
    ]);
    recipientIds.delete(sessionUser.id);

    // Sequential, not Promise.all: the pooled Postgres connection (pgbouncer,
    // connection_limit=1) can't serve concurrent queries from the same request.
    for (const userId of recipientIds) {
      await createNotification({
        userId,
        title: `New message from ${sessionUser.name}`,
        message: text?.trim() ? text.trim().slice(0, 120) : `Sent ${mediaType === 'audio' ? 'a voice note' : mediaType === 'video' ? 'a video' : 'a photo'}`,
        type: 'NEW_MESSAGE',
      });
    }

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        senderId: message.senderId,
        senderName: message.sender.name,
        senderRole: message.sender.role,
        text: text?.trim() || null,
        mediaUrl,
        mediaType,
        mediaName,
        createdAt: message.createdAt,
      },
    });
  } catch (error) {
    console.error('Failed to send message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
