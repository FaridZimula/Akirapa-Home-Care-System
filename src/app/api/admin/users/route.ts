import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { isCompanyDomainEmail, OFFICIAL_DOMAIN } from '@/lib/adminAllowlist';
import { getSessionUser } from '@/lib/session';
import { UserRole } from '@prisma/client';

export async function POST(request: Request) {
  try {
    // Account provisioning is an administrator action. Without this gate the
    // endpoint mints caregiver, coordinator and family accounts for anyone
    // who can reach it.
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Account provisioning is restricted to administrators' },
        { status: 403 }
      );
    }

    const { email, password, name, role, phoneNumber, payRate, latitude, longitude, profileMetadata, mustChangePassword } = await request.json();

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Email, password, name, and role are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isCompanyDomainEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: `All staff and caregiver accounts must use an official @${OFFICIAL_DOMAIN} email address.` },
        { status: 403 }
      );
    }

    if (!Object.values(UserRole).includes(role)) {
      return NextResponse.json({ error: 'Invalid user role' }, { status: 400 });
    }

    if (role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Creation of Admin portal accounts is disabled. Admin accounts are restricted to system configuration.' },
        { status: 403 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json({ error: `An account for ${normalizedEmail} already exists` }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name,
        role: role as UserRole,
        phoneNumber: phoneNumber || null,
        payRate: payRate ? parseFloat(payRate) : null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        profileMetadata: typeof profileMetadata === 'string' ? profileMetadata : profileMetadata ? JSON.stringify(profileMetadata) : null,
        // Opt-in per account: when set, login diverts to a set-your-own-password
        // step so the admin-issued temporary password stops working immediately.
        mustChangePassword: mustChangePassword === true,
      },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_CREATE_USER',
      details: `Admin ${sessionUser.email} created user account for ${user.email} with role ${user.role}`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
        payRate: user.payRate,
        latitude: user.latitude,
        longitude: user.longitude,
      },
    });

  } catch (error) {
    console.error('Failed to create user account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    // This returns the full staff and client directory, so it carries the same
    // administrator gate as provisioning.
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Account administration is restricted to administrators' },
        { status: 403 }
      );
    }

    const roleFilter = new URL(request.url).searchParams.get('role');
    if (roleFilter && !Object.values(UserRole).includes(roleFilter as UserRole)) {
      return NextResponse.json({ error: 'Invalid user role' }, { status: 400 });
    }

    const users = await prisma.user.findMany({
      where: roleFilter ? { role: roleFilter as UserRole } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phoneNumber: true,
        payRate: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        mustChangePassword: true,
        passwordUpdatedAt: true,
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Password management is restricted to administrators' },
        { status: 403 }
      );
    }

    const { userId, newPassword, mustChangePassword } = await request.json();

    if (!userId || !newPassword) {
      return NextResponse.json(
        { error: 'userId and newPassword are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user account not found' }, { status: 404 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: mustChangePassword !== undefined ? mustChangePassword : true,
        passwordUpdatedAt: new Date(),
      },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_SET_USER_PASSWORD',
      details: `Admin ${sessionUser.email} set a new initial password for user ${targetUser.email} (Role: ${targetUser.role})`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      message: `Password updated successfully for ${targetUser.name} (${targetUser.email}).`,
    });
  } catch (error) {
    console.error('Failed to set user password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

