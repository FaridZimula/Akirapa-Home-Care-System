import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { isBusinessHubAuthorized } from '@/lib/adminAllowlist';
import { getSessionUser } from '@/lib/session';
import { UserRole } from '@prisma/client';
import { formatUSPhoneWithCountryCode } from '@/lib/phone';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Client provisioning is restricted to administrators' }, { status: 403 });
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
    const formattedPhone = formatUSPhoneWithCountryCode(phoneNumber);
    const formattedEmergencyPhone = formatUSPhoneWithCountryCode(emergencyContactPhone) || '';

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
          phoneNumber: formattedPhone,
          profileMetadata: JSON.stringify({ initialPassword: password }),
          mustChangePassword: true,
        },
      });
    } else {
      // If family user already exists, update credentials & phone so new password set by admin takes effect
      let existingUserMeta: any = {};
      try { existingUserMeta = user.profileMetadata ? JSON.parse(user.profileMetadata) : {}; } catch {}
      existingUserMeta.initialPassword = password;

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          name: name || user.name,
          phoneNumber: formattedPhone || user.phoneNumber,
          profileMetadata: JSON.stringify(existingUserMeta),
          mustChangePassword: true,
        },
      });
    }

    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ') || 'Not specified';

    // Parse and sanitize numeric float fields to prevent NaN crashes in Prisma
    const rawLat = typeof latitude === 'number' ? latitude : parseFloat(latitude);
    const parsedLat = typeof rawLat === 'number' && !isNaN(rawLat) ? rawLat : 49.2827;

    const rawLng = typeof longitude === 'number' ? longitude : parseFloat(longitude);
    const parsedLng = typeof rawLng === 'number' && !isNaN(rawLng) ? rawLng : -123.1207;

    const rawRate = typeof billingRatePerHour === 'number' ? billingRatePerHour : parseFloat(billingRatePerHour);
    const parsedBillingRate = typeof rawRate === 'number' && !isNaN(rawRate) ? rawRate : 45.0;

    // Create client record
    const client = await prisma.client.create({
      data: {
        name,
        address: fullAddress,
        latitude: parsedLat,
        longitude: parsedLng,
        geofenceRadiusMeter: 200,
        billingRatePerHour: parsedBillingRate,
        profileMetadata: JSON.stringify({
          careTier: careTier || 'Standard',
          city: city || null,
          state: state || null,
          zip: zip || null,
          dob: null,
          gender: null,
          primaryEmergency: emergencyContactName ? {
            name: emergencyContactName,
            phone: formattedEmergencyPhone,
            relationship: emergencyContactRelationship || 'Family Contact',
          } : null,
        }),
      },
    });

    // Seed default Care Plan & initial tasks for the client
    const carePlan = await prisma.carePlan.create({
      data: {
        clientId: client.id,
      },
    });

    await prisma.carePlanTask.createMany({
      data: [
        {
          carePlanId: carePlan.id,
          taskName: 'Vital Signs Checklist',
          description: 'Measure blood pressure, pulse, and temperature. Document in care feed.',
          scheduledTime: '09:00 AM',
          isMandatory: true,
        },
        {
          carePlanId: carePlan.id,
          taskName: 'Daily Medication Assistance',
          description: 'Assist client with scheduled daily medication regimen.',
          scheduledTime: '12:00 PM',
          isMandatory: true,
        },
        {
          carePlanId: carePlan.id,
          taskName: 'Mobility & Hydration Check',
          description: 'Encourage hydration and assist with light indoor/outdoor mobility walk.',
          scheduledTime: '03:00 PM',
          isMandatory: false,
        },
      ],
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
