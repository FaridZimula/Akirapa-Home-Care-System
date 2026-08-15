import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { verifyPassword } from '@/lib/password';
import { createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { isAdminEmailAllowed, isCompanyDomainEmail, OFFICIAL_DOMAIN } from '@/lib/adminAllowlist';
import { UserRole } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Lookup existing user record
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: `Account not found for ${normalizedEmail}. Please check your credentials or contact an administrator.` },
        { status: 404 }
      );
    }

    // 3. Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      await logAudit({
        userId: user.id,
        action: 'LOGIN_FAILED',
        details: `Failed login attempt for ${normalizedEmail}: incorrect password`,
        outcome: 'FAILURE',
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // 4. Admin allowlist check
    if (user.role === UserRole.ADMIN && !isAdminEmailAllowed(user.email)) {
      await logAudit({
        userId: user.id,
        action: 'ADMIN_LOGIN_DENIED',
        details: `Blocked admin login for unauthorized email: ${normalizedEmail}`,
        outcome: 'FAILURE',
      });
      return NextResponse.json({ error: 'This email is not authorized for admin access.' }, { status: 403 });
    }

    // 5. Log audit for successful login
    await logAudit({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      details: `User logged in: ${normalizedEmail} with role ${user.role}`,
      outcome: 'SUCCESS',
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
        latitude: user.latitude,
        longitude: user.longitude,
        mustChangePassword: user.mustChangePassword,
      },
    });

    // Set signed, httpOnly session cookie
    const session = createSessionCookie(user.id);
    response.cookies.set(session.name, session.value, sessionCookieOptions(session.maxAge));

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
