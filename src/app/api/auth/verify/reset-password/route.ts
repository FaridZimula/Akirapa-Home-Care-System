import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { isCompanyDomainEmail, OFFICIAL_DOMAIN } from '@/lib/adminAllowlist';

export async function POST(request: Request) {
  try {
    const { email, token, newPassword } = await request.json();

    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: 'Email, verification token, and new password are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isCompanyDomainEmail(normalizedEmail)) {
      return NextResponse.json({ error: `Password resets are restricted to official @${OFFICIAL_DOMAIN} email addresses.` }, { status: 403 });
    }

    // Find and validate verification token
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        email: normalizedEmail,
        token,
        purpose: 'PASSWORD_RESET',
      },
    });

    if (!verificationToken) {
      return NextResponse.json({ error: 'Invalid or incorrect verification code' }, { status: 400 });
    }

    // Check expiration
    if (new Date() > verificationToken.expiresAt) {
      // Clean up expired token
      await prisma.verificationToken.delete({ where: { id: verificationToken.id } }).catch(() => {});
      return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
    }

    // Find corresponding user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({ error: 'No user found with this email' }, { status: 404 });
    }

    // Update password. This is the user choosing their own credential, so it
    // also clears any pending admin-issued temporary password requirement.
    await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });

    // Delete token
    await prisma.verificationToken.delete({
      where: { id: verificationToken.id },
    }).catch(() => {});

    // Add security audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_SUCCESS',
        details: `Password successfully reset for account: ${normalizedEmail} via email token verification.`,
        outcome: 'SUCCESS',
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, message: 'Password successfully updated' });

  } catch (err) {
    console.error('Failed to reset password:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
