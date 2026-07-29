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
    const contactId = searchParams.get('contactId');

    if (!clientId && !contactId) {
      return NextResponse.json({ error: 'Client ID or Contact ID is required' }, { status: 400 });
    }

    const targetId = contactId || clientId || '';

    let whereClause: any;

    if (contactId && contactId !== clientId) {
      whereClause = {
        OR: [
          { senderId: sessionUser.id, recipientId: contactId },
          { senderId: contactId, recipientId: sessionUser.id },
        ],
      };
    } else {
      whereClause = {
        OR: [
          { clientId: targetId },
          { recipientId: targetId },
          { senderId: targetId, recipientId: sessionUser.id },
          { senderId: sessionUser.id, recipientId: targetId },
        ],
      };
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
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
    const clientId = formData.get('clientId')?.toString() || '';
    const contactId = formData.get('contactId')?.toString() || null;
    const text = formData.get('text');
    const file = formData.get('file');

    if (!clientId && !contactId) {
      return NextResponse.json({ error: 'Client ID or Contact ID is required' }, { status: 400 });
    }
    const textValue = typeof text === 'string' ? text.trim() : '';
    const hasFile = file instanceof File && file.size > 0;
    if (!textValue && !hasFile) {
      return NextResponse.json({ error: 'Message must include text or an attachment' }, { status: 400 });
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
      const path = `${clientId || 'chat'}/${crypto.randomUUID()}.${ext}`;

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

    // Ensure valid clientId referencing Client table
    let validClientId = clientId;
    const clientCheck = validClientId ? await prisma.client.findUnique({ where: { id: validClientId } }) : null;
    if (!clientCheck) {
      const firstClient = await prisma.client.findFirst({ select: { id: true } });
      if (firstClient) {
        validClientId = firstClient.id;
      } else {
        return NextResponse.json({ error: 'No client profile configured in system' }, { status: 400 });
      }
    }

    const recipientId = contactId && contactId !== validClientId ? contactId : null;

    const message = await prisma.message.create({
      data: {
        clientId: validClientId,
        senderId: sessionUser.id,
        recipientId: recipientId,
        encryptedText: textValue ? encrypt(textValue) : null,
        mediaUrl: mediaPath,
        mediaType,
        mediaName,
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    try {
      await logAudit({
        userId: sessionUser.id,
        action: 'MESSAGE_SENT',
        details: `${sessionUser.role} ${sessionUser.email} sent a message in conversation.`,
        outcome: 'SUCCESS',
      });
    } catch (auditErr) {
      console.error('Non-critical audit log failure:', auditErr);
    }

    // Safely attempt notifications
    try {
      const recipientSet = new Set<string>();
      if (recipientId) {
        recipientSet.add(recipientId);
      } else {
        const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'CARE_COORDINATOR'] } }, select: { id: true } });
        admins.forEach(a => recipientSet.add(a.id));
      }
      recipientSet.delete(sessionUser.id);

      for (const targetUserId of recipientSet) {
        await createNotification({
          userId: targetUserId,
          title: `New message from ${sessionUser.name}`,
          message: textValue ? textValue.slice(0, 120) : `Sent ${mediaType === 'audio' ? 'a voice note' : mediaType === 'video' ? 'a video' : 'a photo'}`,
          type: 'NEW_MESSAGE',
        });
      }
    } catch (notifErr) {
      console.error('Non-critical notification error:', notifErr);
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
