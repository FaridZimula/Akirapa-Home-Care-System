import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getUserNotifications, markAllAsRead, createNotification, notifyAdmins, notifyClientFamily } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notifications = await getUserNotifications(sessionUser.id);
    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Failed to get notifications API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      // Empty body indicates a simple mark-all-read request
    }

    // 1. If body contains alert payload, dispatch alert notifications
    if (body && body.title && body.message) {
      const { title, message, type = 'SYSTEM_ALERT', clientId } = body;

      // If clinical alert or emergency SOS, notify all admins
      if (type === 'CLINICAL_ALERT') {
        await notifyAdmins({
          title,
          message: `${message} (Reported by ${sessionUser.name})`,
          type: 'CLINICAL_ALERT',
        });

        // Also notify client's linked family if clientId is provided or found
        let targetClientId = clientId;
        if (!targetClientId && sessionUser.role === 'CAREGIVER') {
          const activePod = await prisma.caregiverPod.findFirst({
            where: { caregiverId: sessionUser.id },
            select: { clientId: true },
          });
          if (activePod) targetClientId = activePod.clientId;
        }

        if (targetClientId) {
          await notifyClientFamily({
            clientId: targetClientId,
            title,
            message,
            type: 'CLINICAL_ALERT',
            excludeUserId: sessionUser.id,
          });
        }
      } else {
        await notifyAdmins({
          title,
          message: `${message} (${sessionUser.name})`,
          type,
        });
      }

      // Record receipt notification for reporting user
      await createNotification({
        userId: sessionUser.id,
        title: `Dispatched: ${title}`,
        message: `Your alert has been received by care coordination: ${message}`,
        type,
      });

      return NextResponse.json({ success: true, message: 'Alert dispatched successfully' });
    }

    // 2. Default action: mark all notifications as read for current user
    const result = await markAllAsRead(sessionUser.id);
    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Failed to process notifications POST API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
