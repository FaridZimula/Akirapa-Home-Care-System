import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { getSessionUser } from '@/lib/session';
import { logAudit } from '@/lib/audit';

// System-wide message oversight for ADMIN / CARE_COORDINATOR.
//
// A "conversation" here is derived, because Message has no thread table:
//   - recipientId set  -> a 1-on-1 DM, identified by the sorted participant pair
//   - recipientId null -> a client care-team thread shared by that client's
//                         pod caregivers + linked family, identified by clientId
//
// Reading a transcript is a privileged action, so every transcript request
// writes a MESSAGE_MONITORING_ACCESS audit entry naming the reviewer and thread.

type Participant = { id: string; name: string; role: string };

function directThreadKey(a: string, b: string) {
  return `dm:${[a, b].sort().join(':')}`;
}

function groupThreadKey(clientId: string) {
  return `group:${clientId}`;
}

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || (sessionUser.role !== 'ADMIN' && sessionUser.role !== 'CARE_COORDINATOR')) {
      return NextResponse.json({ error: 'Message oversight is restricted to administrators' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const threadKey = searchParams.get('threadKey');

    // ---- Single transcript ----
    if (threadKey) {
      let where: any;
      let label = '';

      if (threadKey.startsWith('dm:')) {
        const [, idA, idB] = threadKey.split(':');
        if (!idA || !idB) {
          return NextResponse.json({ error: 'Malformed thread key' }, { status: 400 });
        }
        where = {
          OR: [
            { senderId: idA, recipientId: idB },
            { senderId: idB, recipientId: idA },
          ],
        };
        const [userA, userB] = await Promise.all([
          prisma.user.findUnique({ where: { id: idA }, select: { name: true } }),
          prisma.user.findUnique({ where: { id: idB }, select: { name: true } }),
        ]);
        label = `direct conversation between ${userA?.name ?? 'unknown'} and ${userB?.name ?? 'unknown'}`;
      } else if (threadKey.startsWith('group:')) {
        const clientId = threadKey.slice('group:'.length);
        if (!clientId) {
          return NextResponse.json({ error: 'Malformed thread key' }, { status: 400 });
        }
        where = { clientId, recipientId: null };
        const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
        label = `care-team thread for client ${client?.name ?? 'unknown'}`;
      } else {
        return NextResponse.json({ error: 'Malformed thread key' }, { status: 400 });
      }

      const rows = await prisma.message.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, name: true, role: true } },
          client: { select: { id: true, name: true } },
        },
      });

      const recipientIds = Array.from(
        new Set(rows.map(r => r.recipientId).filter((v): v is string => Boolean(v)))
      );
      const recipients = recipientIds.length
        ? await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, name: true } })
        : [];
      const recipientNameById = new Map(recipients.map(r => [r.id, r.name]));

      await logAudit({
        userId: sessionUser.id,
        action: 'MESSAGE_MONITORING_ACCESS',
        details: `${sessionUser.role} ${sessionUser.email} opened the full transcript of the ${label} (${rows.length} messages).`,
        outcome: 'SUCCESS',
      });

      return NextResponse.json({
        threadKey,
        messages: rows.map(m => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.name,
          senderRole: m.sender.role,
          recipientName: m.recipientId ? recipientNameById.get(m.recipientId) ?? null : null,
          clientName: m.client.name,
          text: m.encryptedText ? decrypt(m.encryptedText) : null,
          mediaType: m.mediaType,
          mediaName: m.mediaName,
          hasAttachment: Boolean(m.mediaUrl),
          createdAt: m.createdAt,
        })),
      });
    }

    // ---- Thread list + stats ----
    const all = await prisma.message.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        client: { select: { id: true, name: true } },
      },
    });

    const recipientIds = Array.from(
      new Set(all.map(m => m.recipientId).filter((v): v is string => Boolean(v)))
    );
    const recipients = recipientIds.length
      ? await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, name: true, role: true } })
      : [];
    const recipientById = new Map(recipients.map(r => [r.id, r]));

    type Thread = {
      threadKey: string;
      type: 'DIRECT' | 'GROUP';
      participants: Participant[];
      clientName: string | null;
      messageCount: number;
      attachmentCount: number;
      lastMessageAt: Date;
      lastMessagePreview: string;
      lastSenderName: string;
      searchBlob: string;
    };

    const threads = new Map<string, Thread>();

    for (const m of all) {
      const isDirect = Boolean(m.recipientId);
      const key = isDirect
        ? directThreadKey(m.senderId, m.recipientId as string)
        : groupThreadKey(m.clientId);

      const text = m.encryptedText ? decrypt(m.encryptedText) : null;
      const preview = text
        ? text.slice(0, 90)
        : m.mediaType === 'audio'
          ? '[voice note]'
          : m.mediaType === 'video'
            ? '[video]'
            : m.mediaUrl
              ? '[photo]'
              : '[no content]';

      let thread = threads.get(key);
      if (!thread) {
        const participants: Participant[] = [
          { id: m.sender.id, name: m.sender.name, role: m.sender.role },
        ];
        if (isDirect) {
          const other = recipientById.get(m.recipientId as string);
          if (other) participants.push({ id: other.id, name: other.name, role: other.role });
        }
        thread = {
          threadKey: key,
          type: isDirect ? 'DIRECT' : 'GROUP',
          participants,
          clientName: isDirect ? null : m.client.name,
          messageCount: 0,
          attachmentCount: 0,
          lastMessageAt: m.createdAt,
          lastMessagePreview: preview,
          lastSenderName: m.sender.name,
          searchBlob: '',
        };
        threads.set(key, thread);
      }

      if (!thread.participants.some(p => p.id === m.sender.id)) {
        thread.participants.push({ id: m.sender.id, name: m.sender.name, role: m.sender.role });
      }

      thread.messageCount += 1;
      if (m.mediaUrl) thread.attachmentCount += 1;
      // rows are ascending, so the final assignment is the latest message
      thread.lastMessageAt = m.createdAt;
      thread.lastMessagePreview = preview;
      thread.lastSenderName = m.sender.name;
      thread.searchBlob += ` ${m.sender.name} ${text ?? ''}`;
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const threadList = Array.from(threads.values())
      .map(t => ({ ...t, searchBlob: t.searchBlob.toLowerCase() }))
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

    return NextResponse.json({
      stats: {
        totalMessages: all.length,
        totalConversations: threadList.length,
        directConversations: threadList.filter(t => t.type === 'DIRECT').length,
        messagesToday: all.filter(m => m.createdAt >= startOfToday).length,
        attachmentsShared: all.filter(m => m.mediaUrl).length,
        activeParticipants: new Set(all.map(m => m.senderId)).size,
      },
      threads: threadList,
    });
  } catch (error) {
    console.error('Failed to load message oversight data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
