import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logAudit } from '@/lib/audit';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session_user');
    
    if (sessionCookie?.value) {
      try {
        const user = JSON.parse(sessionCookie.value);
        await logAudit({
          userId: user.id,
          action: 'LOGOUT',
          details: `User logged out: ${user.email}`,
          outcome: 'SUCCESS',
        });
      } catch (err) {
        console.error('Failed to parse session cookie for audit logging during logout:', err);
      }
    }

    const response = NextResponse.json({ success: true });
    
    // Clear session cookie
    response.cookies.set('session_user', '', {
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
