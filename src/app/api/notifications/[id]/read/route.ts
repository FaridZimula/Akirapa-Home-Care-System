import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { markAsRead } from '@/lib/notifications';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session_user');

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const user = JSON.parse(sessionCookie.value);
    const notification = await markAsRead(id, user.id);

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    console.error('Failed to mark notification read API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
