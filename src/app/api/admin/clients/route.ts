import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { isBusinessHubAuthorized } from '@/lib/adminAllowlist';
import { getSessionUser } from '@/lib/session';
import { UserRole } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Client provisioning is restricted to administrators' }, { status: 403 });
    }

    if (!isBusinessHubAuthorized(sessionUser.email)) {
      return NextResponse.json(
        { error: 'Client provisioning is restricted to authorized senior business administrators (cathy@akirapahomecareus.com and info@akirapahomecareus.com).' },
        { status: 403 }
      );
    }

    const {
      name,
      email,
      password,
      address,
      city,
      state,
      zip,
      phoneNumber,
      careTier,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
      billingRatePerHour,
      latitude,
      longitude,
    } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Client name, email, and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && user.role !== 'FAMILY_MEMBER') {
      return NextResponse.json({ error: `An account with email ${normalizedEmail} already exists with role ${user.role}.` }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: hashedPassword,
          name,
          role: UserRole.FAMILY_MEMBER,
          phoneNumber: phoneNumber || null,
          mustChangePassword: true,
        },
      });
    }

    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ') || 'Not specified';

    // Create client record
    const client = await prisma.client.create({
      data: {
        name,
        address: fullAddress,
        latitude: typeof latitude === 'number' ? latitude : 49.2827,
        longitude: typeof longitude === 'number' ? longitude : -123.1207,
        geofenceRadiusMeter: 200,
        billingRatePerHour: typeof billingRatePerHour === 'number' ? billingRatePerHour : 45.0,
        profileMetadata: JSON.stringify({
          careTier: careTier || 'Standard',
          city: city || null,
          state: state || null,
          zip: zip || null,
          dob: null,
          gender: null,
          primaryEmergency: emergencyContactName ? {
            name: emergencyContactName,
            phone: emergencyContactPhone || '',
            relationship: emergencyContactRelationship || 'Family Contact',
          } : null,
        }),
      },
    });

    // Link Family User to Client
    await prisma.linkedFamilyMember.upsert({
      where: {
        clientId_userId: {
          clientId: client.id,
          userId: user.id,
        },
      },
      create: {
        clientId: client.id,
        userId: user.id,
      },
      update: {},
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_PROVISION_CLIENT',
      details: `Admin ${sessionUser.email} provisioned client ${name} and created family user ${normalizedEmail}.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      client,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      message: `Client ${name} and family account (${normalizedEmail}) provisioned successfully!`,
    });
  } catch (error) {
    console.error('Client provisioning error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
