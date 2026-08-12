import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { isCompanyDomainEmail, OFFICIAL_DOMAIN } from '@/lib/adminAllowlist';
import { UserRole } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { email, password, name, role, phoneNumber, payRate, latitude, longitude, profileMetadata } = await request.json();

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
      },
    });

    await logAudit({
      userId: user.id,
      action: 'ADMIN_CREATE_USER',
      details: `Admin created user account for ${user.email} with role ${user.role}`,
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

export async function GET() {
  try {
    const users = await prisma.user.findMany({
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
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
