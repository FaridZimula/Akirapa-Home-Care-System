import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { getSessionUser } from '@/lib/session';

// Re-issues a temporary password for a provisioned account.
//
// There is deliberately no way to read an existing password back: only the
// bcrypt hash is stored. An admin who needs to give someone their login details
// again sets a new temporary password here and reads it out, which is the same
// position they were in when the account was first created.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Password resets are restricted to administrators' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { password, mustChangePassword } = await request.json();

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'A temporary password of at least 8 characters is required' },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id } });

    if (!target) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Admin passwords are not resettable from this screen. Letting one admin
    // silently take over another admin's account would remove any meaningful
    // separation between them.
    if (target.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Administrator passwords cannot be reset from account administration' },
        { status: 403 }
      );
    }

    let targetMeta: any = {};
    try {
      targetMeta = target.profileMetadata ? JSON.parse(target.profileMetadata) : {};
    } catch {}
    targetMeta.initialPassword = password;

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(password),
        profileMetadata: JSON.stringify(targetMeta),
        mustChangePassword: mustChangePassword === true,
        passwordUpdatedAt: new Date(),
      },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_RESET_USER_PASSWORD',
      details: `Admin ${sessionUser.email} issued a new temporary password for ${target.email} (${target.role})`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to reset user password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
