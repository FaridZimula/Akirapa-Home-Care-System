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
      // Extended intake & MA 6-Section Assessment fields
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

      // Client Referral Type & Government Sponsoring Agency
      referralType,
      governmentProgram,

      // Section 1: Demographics & Emergency Logistics
      preferredPronouns,
      preferredLanguage,
      pcpName,
      pcpPhone,
      preferredHospital,
      legalStatus,
      advanceDirectives,

      // Section 2: Functional Capabilities (ADLs & IADLs)
      adlMatrix,
      iadlChecklist,
      mobilityStatus,

      // Section 3: Cognitive, Behavioral & Communication
      cognitiveState,
      behavioralNeeds,
      sensoryLimits,

      // Section 4: Non-Medical Health & Environmental Context
      allergiesDetail,
      medicationProfile,
      dietaryBoundaries,

      // Section 5: Environmental & Fall Risk Assessment
      environmentalSafety,
      medicalEquipmentInstalled,
      petLogistics,

      // Section 6: Scheduling, Billing & Legal Consents
      billingSetup,
      digitalConsents,
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
        geofenceRadiusMeter: 100,
        billingRatePerHour: parsedBillingRate,
        profileMetadata: JSON.stringify({
          careTier: careTier || 'Standard',
          referralType: referralType || null,
          governmentProgram: referralType === 'Government Client' ? (governmentProgram || null) : null,
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

          // Massachusetts Compliant Initial Assessment 6-Section Fields
          demographicsLogistics: {
            preferredPronouns: preferredPronouns || null,
            preferredLanguage: preferredLanguage || 'English',
            pcpName: pcpName || null,
            pcpPhone: pcpPhone || null,
            preferredHospital: preferredHospital || null,
            legalStatus: legalStatus || { hcp: false, poa: false, legalRepName: '' },
            advanceDirectives: advanceDirectives || { dnr: false, molst: false },
          },
          functionalAssessment: {
            adlMatrix: adlMatrix || { bathing: 'Independent', dressing: 'Independent', toileting: 'Independent', transferring: 'Independent', eating: 'Independent' },
            iadlChecklist: iadlChecklist || { mealPrep: false, housekeeping: false, groceryShopping: false, transportationArrangement: false },
            mobilityStatus: mobilityStatus || { cane: false, rollingWalker: false, manualWheelchair: false, powerChair: false, notes: '' },
          },
          cognitiveBehavioralProfile: {
            cognitiveState: cognitiveState || { memoryIssues: 'None', confusionLevel: 'Clear', orientation: 'Fully Oriented' },
            behavioralNeeds: behavioralNeeds || { wandering: false, sundowning: false, agitation: false, exitSeeking: false },
            sensoryLimits: sensoryLimits || { hearingLoss: false, visualImpairment: false, speechBarriers: false },
          },
          nonMedicalContext: {
            diagnosisSummary: medicalConditions || null,
            allergiesDetail: allergiesDetail || { food: '', environmental: '', latex: false, notes: allergies || '' },
            medicationProfile: medicationProfile || { remindersOnlyConfirmed: true, medicationList: medicationDetails || '' },
            dietaryBoundaries: dietaryBoundaries || { restrictions: '', mechanicalPrep: 'Regular', fluidThickeners: false },
          },
          fallRiskEnvironmental: {
            safetyHazards: environmentalSafety || { throwRugsClutter: false, stairLighting: true, bathroomGrabBars: false, smokeCoDetectors: true },
            medicalEquipment: medicalEquipmentInstalled || { hospitalBed: false, hoyerLift: false, oxygenTank: false, sliderBoard: false },
            petLogistics: petLogistics || { hasPets: false, petTypes: '', tripRiskToCaregivers: false },
          },
          schedulingBillingConsents: {
            billingSetup: billingSetup || { paymentMechanism: 'Private Pay' },
            digitalConsents: digitalConsents || { planOfCareSigned: true, clientRightsSigned: true, nonClinicalReleaseSigned: true, cancellationPolicySigned: true },
          },
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

    // ── Default Secondary Caregiver: Stuart Ssemwogerere ────────────────────
    // Every new client gets Stuart auto-assigned as their default SECONDARY
    // caregiver pod member (immediate backup caregiver if primary fails to show up).
    try {
      const DEFAULT_SECONDARY_EMAIL = 'sstuart@akirapahomecareus.com';
      let defaultSecondary = await prisma.user.findUnique({
        where: { email: DEFAULT_SECONDARY_EMAIL },
      });

      if (!defaultSecondary) {
        const defaultPasswordHash = await hashPassword('Akirapa2026!');
        defaultSecondary = await prisma.user.create({
          data: {
            email: DEFAULT_SECONDARY_EMAIL,
            passwordHash: defaultPasswordHash,
            name: 'Stuart Ssemwogerere',
            role: UserRole.CAREGIVER,
            phoneNumber: '+13399701214',
            payRate: 28.0,
            profileMetadata: JSON.stringify({
              title: 'Default Secondary & Immediate Backup Caregiver',
              initialPassword: 'Akirapa2026!',
            }),
          },
        });
      }

      await prisma.caregiverPod.upsert({
        where: {
          clientId_role: {
            clientId: client.id,
            role: 'SECONDARY_1',
          },
        },
        create: {
          clientId: client.id,
          caregiverId: defaultSecondary.id,
          role: 'SECONDARY_1',
        },
        update: {
          caregiverId: defaultSecondary.id,
        },
      });

      await logAudit({
        userId: sessionUser.id,
        action: 'AUTO_POD_ASSIGN',
        details: `Default secondary caregiver ${defaultSecondary.name} (${defaultSecondary.email}) auto-assigned to new client ${name} (${client.id})`,
        outcome: 'SUCCESS',
      });
    } catch (podErr) {
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
