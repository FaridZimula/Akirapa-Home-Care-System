import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import { getSessionUser, SessionUser } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { supabaseAdmin, MESSAGE_MEDIA_BUCKET, MAX_ATTACHMENT_BYTES, classifyMediaType } from '@/lib/supabaseStorage';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour - long enough for a chat session to load

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

    // mediaUrl in the DB is a storage path, not a public URL - resolve every
    // attachment in this thread to a single batch of short-lived signed URLs.
    const mediaPaths = messages.filter(m => m.mediaUrl).map(m => m.mediaUrl as string);
    const signedUrlByPath = new Map<string, string>();
    if (mediaPaths.length > 0) {
      const { data: signedUrls, error } = await supabaseAdmin.storage
        .from(MESSAGE_MEDIA_BUCKET)
        .createSignedUrls(mediaPaths, SIGNED_URL_TTL_SECONDS);
      if (error) {
        console.error('Failed to create signed URLs for message media:', error);
      } else {
        for (const entry of signedUrls) {
          if (entry.signedUrl && entry.path) signedUrlByPath.set(entry.path, entry.signedUrl);
        }
      }
    }

    const decrypted = messages.map(m => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRole: m.sender.role,
      text: m.encryptedText ? decrypt(m.encryptedText) : null,
      mediaUrl: m.mediaUrl ? (signedUrlByPath.get(m.mediaUrl) || null) : null,
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

    const formData = await request.formData();
    const clientId = formData.get('clientId');
    const text = formData.get('text');
    const file = formData.get('file');

    if (typeof clientId !== 'string' || !clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }
    const textValue = typeof text === 'string' ? text.trim() : '';
    const hasFile = file instanceof File && file.size > 0;
    if (!textValue && !hasFile) {
      return NextResponse.json({ error: 'Message must include text or an attachment' }, { status: 400 });
    }

    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
    const directAccess = await isDirectParticipant(sessionUser, clientId);
    if (!isSupervisor && !directAccess) {
      return NextResponse.json({ error: 'You do not have access to this conversation' }, { status: 403 });
    }

    let mediaPath: string | null = null;
    let mediaType: string | null = null;
    let mediaName: string | null = null;
    let signedMediaUrl: string | null = null;

    if (hasFile && file instanceof File) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `Attachment is too large (max ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB).` }, { status: 400 });
      }

      mediaType = classifyMediaType(file.type || 'image/png');
      mediaName = file.name || null;
      const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
      const path = `${clientId}/${crypto.randomUUID()}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadError } = await supabaseAdmin.storage
        .from(MESSAGE_MEDIA_BUCKET)
        .upload(path, arrayBuffer, { contentType: file.type || 'application/octet-stream' });

      if (uploadError) {
        console.error('Failed to upload message attachment:', uploadError);
        return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
      }

      mediaPath = path;

      const { data: signed } = await supabaseAdmin.storage
        .from(MESSAGE_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      signedMediaUrl = signed?.signedUrl || null;
    }

    const message = await prisma.message.create({
      data: {
        clientId,
        senderId: sessionUser.id,
        encryptedText: textValue ? encrypt(textValue) : null,
        mediaUrl: mediaPath,
        mediaType,
        mediaName,
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'MESSAGE_SENT',
      details: `${sessionUser.role} ${sessionUser.email} sent a message${mediaPath ? ' with attachment' : ''} in the conversation for client ${clientId}.`,
      outcome: 'SUCCESS',
    });

    // Notify every other participant (admins + pod caregivers + linked family) except the sender.
    const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } }, select: { id: true } });
    const pods = await prisma.caregiverPod.findMany({ where: { clientId }, select: { caregiverId: true } });
    const links = await prisma.linkedFamilyMember.findMany({ where: { clientId }, select: { userId: true } });
    const recipientIds = new Set<string>([
      ...admins.map(a => a.id),
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
        message: textValue ? textValue.slice(0, 120) : `Sent ${mediaType === 'audio' ? 'a voice note' : mediaType === 'video' ? 'a video' : 'a photo'}`,
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
        text: textValue || null,
        mediaUrl: signedMediaUrl,
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

export async function DELETE(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
    const isSender = message.senderId === sessionUser.id;

    if (!isSender && !isSupervisor) {
      return NextResponse.json({ error: 'You are not authorized to delete this message' }, { status: 403 });
    }

    // Delete attachment from Supabase storage if present
    if (message.mediaUrl) {
      try {
        await supabaseAdmin.storage.from(MESSAGE_MEDIA_BUCKET).remove([message.mediaUrl]);
      } catch (err) {
        console.error('Failed to remove media file from storage:', err);
      }
    }

    // Delete message record from database
    await prisma.message.delete({
      where: { id: messageId },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'MESSAGE_DELETED',
      details: `${sessionUser.role} ${sessionUser.email} deleted/unsent message ${messageId}.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    console.error('Failed to delete message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
