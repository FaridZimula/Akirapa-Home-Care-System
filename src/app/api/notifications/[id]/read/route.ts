import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { markAsRead } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let sessionUser = await getSessionUser();

    if (!sessionUser) {
      const headerEmail = request.headers.get('x-user-email');
      if (headerEmail) {
        const dbUser = await prisma.user.findUnique({ where: { email: headerEmail.trim().toLowerCase() } });
        if (dbUser) {
          sessionUser = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role,
            phoneNumber: dbUser.phoneNumber,
            latitude: dbUser.latitude,
            longitude: dbUser.longitude,
            mustChangePassword: dbUser.mustChangePassword,
          };
        }
      }
    }

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
