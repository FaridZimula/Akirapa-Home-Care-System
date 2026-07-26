import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getUserNotifications, markAllAsRead } from '@/lib/notifications';

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

export async function POST() {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await markAllAsRead(sessionUser.id);
    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Failed to mark all notifications read API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
