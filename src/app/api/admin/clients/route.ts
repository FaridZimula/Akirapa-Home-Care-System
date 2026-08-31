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
    let sessionUser = await getSessionUser();

    // Fallback authentication check via x-admin-email header if session cookie expired/missing
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      const adminHeaderEmail = request.headers.get('x-admin-email');
      if (adminHeaderEmail) {
        const adminDbUser = await prisma.user.findUnique({
          where: { email: adminHeaderEmail.trim().toLowerCase() },
        });
        if (adminDbUser && adminDbUser.role === 'ADMIN') {
          sessionUser = {
            id: adminDbUser.id,
            email: adminDbUser.email,
            name: adminDbUser.name,
            role: 'ADMIN',
            phoneNumber: adminDbUser.phoneNumber,
            latitude: adminDbUser.latitude,
            longitude: adminDbUser.longitude,
            mustChangePassword: adminDbUser.mustChangePassword,
          };
        }
      }
    }

    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Client provisioning is restricted to administrators' }, { status: 403 });
    }

    const {
      name,
      email,
      password,
      familyMemberName,
      familyMemberRelationship,
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
      // Extended intake fields
      dob,
      gender,
      medicalConditions,
      allergies,
      mobility,
      medicationDetails,
      energyLevel,
      painLevel,
      mood,
      alertness,
      appetite,
      hydration,
      sleep,
      carePreferences,
      personality,
      dailyRoutine,
      preferredCaregiverType,
      additionalObservations,
      emergency2Name,
      emergency2Phone,
      emergency2Relationship,
    } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Client name, email, and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const formattedPhone = formatUSPhoneWithCountryCode(phoneNumber);
    const formattedEmergencyPhone = formatUSPhoneWithCountryCode(emergencyContactPhone) || '';
    const formattedEmergency2Phone = emergency2Phone ? formatUSPhoneWithCountryCode(emergency2Phone) || '' : '';

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && user.role !== 'FAMILY_MEMBER') {
      return NextResponse.json({ error: `An account with email ${normalizedEmail} already exists with role ${user.role}.` }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    const familySponsorDisplayName = familyMemberName ? familyMemberName.trim() : name;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: hashedPassword,
          name: familySponsorDisplayName,
          role: UserRole.FAMILY_MEMBER,
          phoneNumber: formattedPhone,
          profileMetadata: JSON.stringify({
            initialPassword: password,
            familyRelationship: familyMemberRelationship || 'Family Member',
            clientName: name,
          }),
          mustChangePassword: true,
        },
      });
    } else {
      // If family user already exists, update credentials & phone so new password set by admin takes effect
      let existingUserMeta: any = {};
      try { existingUserMeta = user.profileMetadata ? JSON.parse(user.profileMetadata) : {}; } catch {}
      existingUserMeta.initialPassword = password;
      existingUserMeta.familyRelationship = familyMemberRelationship || existingUserMeta.familyRelationship || 'Family Member';
      existingUserMeta.clientName = name;

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          name: familySponsorDisplayName || user.name,
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
          familySponsor: {
            name: familyMemberName ? familyMemberName.trim() : (emergencyContactName || 'Family Representative'),
            relationship: familyMemberRelationship || emergencyContactRelationship || 'Family Member',
            email: normalizedEmail,
            phone: formattedPhone || formattedEmergencyPhone,
          },
          city: city || null,
          state: state || null,
          zip: zip || null,
          dob: dob || null,
          gender: gender || null,
          primaryEmergency: emergencyContactName ? {
            name: emergencyContactName,
            phone: formattedEmergencyPhone,
            relationship: emergencyContactRelationship || 'Family Contact',
          } : null,
          secondaryEmergency: emergency2Name ? {
            name: emergency2Name,
            phone: formattedEmergency2Phone,
            relationship: emergency2Relationship || 'Family Contact',
          } : null,
          medicalConditions: medicalConditions || null,
          allergies: allergies || null,
          mobility: mobility || null,
          medicationDetails: medicationDetails || null,
          wellbeingBaseline: {
            energyLevel: energyLevel || null,
            painLevel: painLevel || null,
            mood: mood || null,
            alertness: alertness || null,
            appetite: appetite || null,
            hydration: hydration || null,
            sleep: sleep || null,
          },
          carePreferences: carePreferences || null,
          personality: personality || null,
          dailyRoutine: dailyRoutine || null,
          preferredCaregiverType: preferredCaregiverType || null,
          additionalObservations: additionalObservations || null,
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

    // ── Default Secondary Caregiver: Stuart Sssemwogerere ────────────────────
    // Every new client gets Stuart auto-assigned as their default SECONDARY
    // caregiver pod member. This runs silently and never blocks provisioning.
    try {
      const DEFAULT_SECONDARY_EMAIL = 'sstuart@akirapahomecareus.com';
      const defaultSecondary = await prisma.user.findUnique({
        where: { email: DEFAULT_SECONDARY_EMAIL },
      });

      if (defaultSecondary && defaultSecondary.role === 'CAREGIVER') {
        await prisma.caregiverPod.create({
          data: {
            clientId: client.id,
            caregiverId: defaultSecondary.id,
            role: 'SECONDARY_1',
          },
        });

        await logAudit({
          userId: sessionUser.id,
          action: 'AUTO_POD_ASSIGN',
          details: `Default secondary caregiver ${defaultSecondary.name} (${defaultSecondary.email}) auto-assigned to new client ${name} (${client.id})`,
          outcome: 'SUCCESS',
        });
      }
    } catch (podErr) {
      // Non-fatal: log but don't fail the overall provisioning
      console.warn('Default secondary caregiver auto-assign failed:', podErr);
    }
    // ─────────────────────────────────────────────────────────────────────────

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
