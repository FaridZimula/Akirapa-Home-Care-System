import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { verifyPassword, hashPassword } from '@/lib/password';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User record not found' }, { status: 404 });
    }

    // Verify current password
    const isCurrentValid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Update password. Clearing mustChangePassword is what releases an account
    // provisioned with a temporary password into normal use.
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });

    // Log audit action
    await logAudit({
      userId: sessionUser.id,
      action: 'PASSWORD_CHANGE_SUCCESS',
      details: `User ${sessionUser.email} changed their password via account settings.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Failed to change password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
