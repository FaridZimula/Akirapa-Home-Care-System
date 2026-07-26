import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { markAsRead } from '@/lib/notifications';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const notification = await markAsRead(id, sessionUser.id);

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
