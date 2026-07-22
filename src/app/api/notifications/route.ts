import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserNotifications, markAllAsRead } from '@/lib/notifications';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session_user');

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = JSON.parse(sessionCookie.value);
    const notifications = await getUserNotifications(user.id);
    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Failed to get notifications API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session_user');

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = JSON.parse(sessionCookie.value);
    const result = await markAllAsRead(user.id);
    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Failed to mark all notifications read API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
