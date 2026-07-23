import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/lib/session';

export async function POST() {
  try {
    const user = await getSessionUser();

    if (user) {
      await logAudit({
        userId: user.id,
        action: 'LOGOUT',
        details: `User logged out: ${user.email}`,
        outcome: 'SUCCESS',
      });
    }

    const response = NextResponse.json({ success: true });

    // Clear session cookie
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      path: '/',
      maxAge: -1,
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
