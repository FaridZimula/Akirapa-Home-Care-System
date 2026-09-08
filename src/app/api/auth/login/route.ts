import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { verifyPassword } from '@/lib/password';
import { createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { isEmailAllowedForRole } from '@/lib/adminAllowlist';
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

    // 4. Email-domain policy: admins must be on the code-held allowlist, caregivers
    // on the official company domain, and self-registered client accounts on a
    // personal Gmail. Accounts a super admin provisioned are exempt (non-admin only).
    const policy = isEmailAllowedForRole(user.role, user.email, user.isAdminProvisioned);
    if (!policy.ok) {
      await logAudit({
        userId: user.id,
        action: user.role === UserRole.ADMIN ? 'ADMIN_LOGIN_DENIED' : 'LOGIN_DENIED_EMAIL_POLICY',
        details: `Blocked login for ${normalizedEmail} (role ${user.role}): email not permitted by domain policy.`,
        outcome: 'FAILURE',
      });
      return NextResponse.json({ error: policy.error }, { status: 403 });
    }

    // 5. Log audit for successful login
    logAudit({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      details: `User logged in: ${normalizedEmail} with role ${user.role}`,
      outcome: 'SUCCESS',
    }).catch((err) => console.error('Audit log error on login:', err));

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
