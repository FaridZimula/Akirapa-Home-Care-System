import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { computeHaversineDistance } from '@/lib/geo';
import { decrypt } from '@/lib/crypto';

export async function GET(request: Request) {
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
      return NextResponse.json(
        { error: 'Activity audits and digital footprints are restricted to administrators' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const auditLimitParam = searchParams.get('auditLimit');
    const auditLimit = auditLimitParam ? parseInt(auditLimitParam, 10) : 1000;

    // 1. Fetch All Clients with deep relations
    const rawClients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        caregiverPods: {
          include: {
            caregiver: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
                role: true,
                payRate: true,
              },
            },
          },
        },
        familyMembers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
                profileMetadata: true,
              },
            },
          },
        },
        shifts: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            actualStart: true,
            actualEnd: true,
            caregiverId: true,
          },
          orderBy: { scheduledStart: 'desc' },
        },
        carePlans: {
          include: {
            tasks: true,
          },
        },
        _count: {
          select: {
            shifts: true,
            activityLogs: true,
            invoices: true,
            caregiverReviews: true,
          },
        },
      },
    });

    // 2. Fetch All Caregivers and staff
    const rawCaregivers = await prisma.user.findMany({
      where: {
        role: { in: ['CAREGIVER', 'ADMIN'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumber: true,
        payRate: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        mustChangePassword: true,
        passwordUpdatedAt: true,
        profileMetadata: true,
        podAssignments: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
        assignedShifts: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            clientId: true,
          },
          orderBy: { scheduledStart: 'desc' },
        },
        reviewsReceived: {
          select: {
            id: true,
            rating: true,
            wouldContinue: true,
            strengths: true,
            improvements: true,
            createdAt: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            assignedShifts: true,
            podAssignments: true,
            reviewsReceived: true,
            auditLogs: true,
          },
        },
      },
    });

    // 3. Fetch System Audit Logs
    const rawAudits = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: isNaN(auditLimit) ? 1000 : Math.min(Math.max(auditLimit, 50), 3000),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // 4. Fetch Rich Shift Activities & Digital Footprints (Clock-in, GPS coordinates, Tasks, Overtime, Overrides)
    const rawShifts = await prisma.shift.findMany({
      orderBy: { scheduledStart: 'desc' },
      take: 1000,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeter: true,
          },
        },
        caregiver: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            payRate: true,
            role: true,
          },
        },
        tasks: {
          select: {
            id: true,
            taskName: true,
            description: true,
            scheduledTime: true,
            isCompleted: true,
            completedAt: true,
          },
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            encryptedLog: true,
            mediaUrls: true,
            createdAt: true,
          },
        },
        locations: {
          orderBy: { timestamp: 'desc' },
          take: 5,
          select: {
            id: true,
            latitude: true,
            longitude: true,
            timestamp: true,
          },
        },
      },
    });

    // Build the Normalized Digital Footprint Activity Stream
    const digitalFootprints: any[] = [];

    // Process Shift Activities
    for (const s of rawShifts) {
      const clientLat = s.client.latitude;
      const clientLng = s.client.longitude;
      const geofenceRadius = s.client.geofenceRadiusMeter || 100;

      // Distance at Clock-In
      let clockInDist: number | null = null;
      let clockInWithinGeofence: boolean | null = null;
      if (s.clockInLat !== null && s.clockInLng !== null && clientLat && clientLng) {
        clockInDist = Math.round(computeHaversineDistance(clientLat, clientLng, s.clockInLat, s.clockInLng));
        clockInWithinGeofence = clockInDist <= geofenceRadius;
      }

      // Distance at Clock-Out
      let clockOutDist: number | null = null;
      let clockOutWithinGeofence: boolean | null = null;
      if (s.clockOutLat !== null && s.clockOutLng !== null && clientLat && clientLng) {
        clockOutDist = Math.round(computeHaversineDistance(clientLat, clientLng, s.clockOutLat, s.clockOutLng));
        clockOutWithinGeofence = clockOutDist <= geofenceRadius;
      }

      // Decrypted clinical care logs
      const decryptedLogs = s.activityLogs.map((log) => {
        let text = '';
        try {
          text = decrypt(log.encryptedLog);
        } catch {
          text = '[Decryption failed]';
        }
        let parsedMedia: string[] = [];
        try {
          parsedMedia = JSON.parse(log.mediaUrls);
        } catch {}
        return {
          id: log.id,
          createdAt: log.createdAt,
          content: text,
          mediaUrls: parsedMedia,
        };
      });

      const completedTasks = s.tasks.filter((t) => t.isCompleted);

      // 4a. Footprint: Clock-In Event
      if (s.actualStart) {
        digitalFootprints.push({
          id: `footprint-clockin-${s.id}`,
          shiftId: s.id,
          timestamp: s.actualStart,
          activityType: 'CLOCK_IN',
          entityType: 'CAREGIVER', // Caregiver clocked in to serve client
          category: 'Location & Time Attendance',
          title: `Caregiver Clock-In: ${s.caregiver.name} arrived at ${s.client.name}`,
          caregiver: s.caregiver,
          client: s.client,
          location: {
            clockInLat: s.clockInLat,
            clockInLng: s.clockInLng,
            distanceMeters: clockInDist,
            withinGeofence: clockInWithinGeofence,
            geofenceRadius,
            isOverrideException: s.isOverrideException,
            overrideReason: s.overrideReason,
          },
          service: {
            scheduledStart: s.scheduledStart,
            scheduledEnd: s.scheduledEnd,
            status: s.status,
            totalTasksScheduled: s.tasks.length,
          },
          details: `Clocked in at ${new Date(s.actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. GPS: ${
            s.clockInLat ? `${s.clockInLat.toFixed(5)}, ${s.clockInLng?.toFixed(5)}` : 'Coordinates missing'
          } (${clockInDist !== null ? `${clockInDist}m from client` : 'Distance unknown'}${
            clockInWithinGeofence ? ' - Inside Geofence' : ' - Outside Geofence'
          }).${s.isOverrideException ? ` Exception Override Reason: "${s.overrideReason}"` : ''}`,
          status: s.isOverrideException ? 'EXCEPTION_OVERRIDE' : clockInWithinGeofence ? 'VERIFIED_LOCATION' : 'OFFSITE_ATTENDANCE',
        });
      }

      // 4b. Footprint: Clock-Out Event
      if (s.actualEnd) {
        const durationHours = s.actualStart
          ? ((new Date(s.actualEnd).getTime() - new Date(s.actualStart).getTime()) / (1000 * 60 * 60)).toFixed(2)
          : null;

        digitalFootprints.push({
          id: `footprint-clockout-${s.id}`,
          shiftId: s.id,
          timestamp: s.actualEnd,
          activityType: 'CLOCK_OUT',
          entityType: 'CAREGIVER',
          category: 'Location & Time Attendance',
          title: `Caregiver Clock-Out: ${s.caregiver.name} completed visit for ${s.client.name}`,
          caregiver: s.caregiver,
          client: s.client,
          location: {
            clockOutLat: s.clockOutLat,
            clockOutLng: s.clockOutLng,
            distanceMeters: clockOutDist,
            withinGeofence: clockOutWithinGeofence,
            geofenceRadius,
          },
          service: {
            durationHours,
            tasksCompletedCount: completedTasks.length,
            tasksScheduledCount: s.tasks.length,
            tasksList: completedTasks.map((t) => t.taskName),
            isOvertime: s.isOvertime,
            overtimeReason: s.overtimeReason,
          },
          details: `Clocked out at ${new Date(s.actualEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${durationHours} hrs). Completed ${
            completedTasks.length
          }/${s.tasks.length} care tasks. GPS: ${
            s.clockOutLat ? `${s.clockOutLat.toFixed(5)}, ${s.clockOutLng?.toFixed(5)}` : 'N/A'
          }.${s.isOvertime ? ` Overtime Claimed: ${s.overtimeReason || 'No reason provided'}` : ''}`,
          status: s.status === 'COMPLETED' ? 'COMPLETED' : s.status,
        });
      }

      // 4c. Footprint: Care & Services Delivery (Tasks & Notes)
      if (completedTasks.length > 0 || decryptedLogs.length > 0) {
        digitalFootprints.push({
          id: `footprint-service-${s.id}`,
          shiftId: s.id,
          timestamp: decryptedLogs[0]?.createdAt || s.actualEnd || s.scheduledEnd,
          activityType: 'SERVICE_DELIVERY',
          entityType: 'CLIENT', // Service delivered to patient
          category: 'Clinical Care & Tasks',
          title: `Clinical Services Delivered for ${s.client.name} by ${s.caregiver.name}`,
          caregiver: s.caregiver,
          client: s.client,
          service: {
            completedTasks: completedTasks.map((t) => ({
              name: t.taskName,
              description: t.description,
              scheduledTime: t.scheduledTime,
              completedAt: t.completedAt,
            })),
            clinicalNotes: decryptedLogs.map((l) => l.content).join(' | '),
            mediaAttachmentsCount: decryptedLogs.reduce((acc, l) => acc + l.mediaUrls.length, 0),
          },
          details: `Services Rendered: [${completedTasks.map((t) => t.taskName).join(', ') || 'General In-Home Support'}]. Notes: ${
            decryptedLogs[0]?.content || 'Standard care plan completed.'
          }`,
          status: 'VERIFIED_SERVICE',
        });
      }

      // 4d. Footprint: Client / Family Visit Approval
      if (s.familyConfirmedAt) {
        digitalFootprints.push({
          id: `footprint-familyconfirm-${s.id}`,
          shiftId: s.id,
          timestamp: s.familyConfirmedAt,
          activityType: 'FAMILY_APPROVAL',
          entityType: 'CLIENT',
          category: 'Client & Family Confirmation',
          title: `Family Visit Confirmation: Approved visit by ${s.caregiver.name}`,
          caregiver: s.caregiver,
          client: s.client,
          details: `Client/Family sponsor approved and confirmed the care session delivered on ${new Date(
            s.scheduledStart
          ).toLocaleDateString()}.`,
          status: 'FAMILY_APPROVED',
        });
      }
    }

    // 4e. Process System Audit Logs into Digital Footprint Stream
    for (const a of rawAudits) {
      // Classify whether this audit belongs to CAREGIVER, CLIENT, or BOTH
      let entityType: 'CAREGIVER' | 'CLIENT' | 'BOTH' = 'BOTH';
      const actionUpper = a.action.toUpperCase();
      const detailsUpper = a.details.toUpperCase();

      if (
        actionUpper.includes('CLIENT') ||
        actionUpper.includes('PATIENT') ||
        detailsUpper.includes('PROVISIONED CLIENT') ||
        detailsUpper.includes('CLIENT PROFILE')
      ) {
        entityType = 'CLIENT';
      } else if (
        a.user?.role === 'CAREGIVER' ||
        actionUpper.includes('CAREGIVER') ||
        detailsUpper.includes('CAREGIVER') ||
        actionUpper.includes('AVAILABILITY')
      ) {
        entityType = 'CAREGIVER';
      }

      // Try to associate with a known client or caregiver
      let matchedClient: any = null;
      let matchedCaregiver: any = null;

      for (const c of rawClients) {
        if (a.details.includes(c.id) || a.details.toLowerCase().includes(c.name.toLowerCase())) {
          matchedClient = { id: c.id, name: c.name, address: c.address };
          break;
        }
      }

      for (const cg of rawCaregivers) {
        if (a.userId === cg.id || a.details.includes(cg.id) || a.details.toLowerCase().includes(cg.name.toLowerCase())) {
          matchedCaregiver = { id: cg.id, name: cg.name, email: cg.email, role: cg.role };
          break;
        }
      }

      digitalFootprints.push({
        id: `footprint-audit-${a.id}`,
        timestamp: a.timestamp,
        activityType: 'AUDIT_EVENT',
        entityType,
        category: 'Security & Administrative Audit',
        title: `System Event: ${a.action} (${a.outcome})`,
        actor: {
          name: a.user?.name || 'System User',
          email: a.user?.email || 'N/A',
          role: a.user?.role || 'UNKNOWN',
        },
        caregiver: matchedCaregiver,
        client: matchedClient,
        details: a.details,
        action: a.action,
        status: a.outcome,
      });
    }

    // Sort digital footprints strictly newest first
    digitalFootprints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Process & Enhance Clients Data
    const clients = rawClients.map((client) => {
      let parsedMeta: any = {};
      try {
        parsedMeta = client.profileMetadata ? JSON.parse(client.profileMetadata) : {};
      } catch {
        parsedMeta = {};
      }

      const totalShifts = client.shifts.length;
      const completedShifts = client.shifts.filter((s) => s.status === 'COMPLETED').length;
      const upcomingShifts = client.shifts.filter(
        (s) => s.status === 'CONFIRMED' || s.status === 'CAREGIVER_CONFIRMED' || s.status === 'UNCONFIRMED'
      ).length;
      const inProgressShifts = client.shifts.filter((s) => s.status === 'IN_PROGRESS').length;
      const lastShift = client.shifts.length > 0 ? client.shifts[0] : null;

      const primaryCaregiver = client.caregiverPods.find((p) => p.role === 'PRIMARY')?.caregiver || null;
      const secondary1Caregiver = client.caregiverPods.find((p) => p.role === 'SECONDARY_1')?.caregiver || null;
      const secondary2Caregiver = client.caregiverPods.find((p) => p.role === 'SECONDARY_2')?.caregiver || null;

      const emergencyContact = parsedMeta.primaryEmergency || (parsedMeta.emergencyContactName ? {
        name: parsedMeta.emergencyContactName,
        phone: parsedMeta.emergencyContactPhone,
        relationship: parsedMeta.emergencyContactRelationship,
      } : null);

      return {
        id: client.id,
        name: client.name,
        address: client.address,
        latitude: client.latitude,
        longitude: client.longitude,
        geofenceRadiusMeter: client.geofenceRadiusMeter,
        billingRatePerHour: client.billingRatePerHour || 45.0,
        createdAt: client.createdAt,
        careTier: parsedMeta.careTier || 'Standard',
        referralType: parsedMeta.referralType || 'Private',
        governmentProgram: parsedMeta.governmentProgram || null,
        familySponsor: parsedMeta.familySponsor || (client.familyMembers[0] ? {
          name: client.familyMembers[0].user.name,
          email: client.familyMembers[0].user.email,
          phone: client.familyMembers[0].user.phoneNumber,
        } : null),
        emergencyContact,
        secondaryEmergency: parsedMeta.secondaryEmergency || null,
        medicalConditions: parsedMeta.medicalConditions || 'None reported',
        allergies: parsedMeta.allergies || 'None reported',
        mobility: parsedMeta.mobility || 'Independent',
        medicationDetails: parsedMeta.medicationDetails || 'None',
        pcpName: parsedMeta.demographicsLogistics?.pcpName || null,
        preferredHospital: parsedMeta.demographicsLogistics?.preferredHospital || null,
        adlMatrix: parsedMeta.functionalAssessment?.adlMatrix || null,
        iadlChecklist: parsedMeta.functionalAssessment?.iadlChecklist || null,
        legalStatus: parsedMeta.demographicsLogistics?.legalStatus || null,
        advanceDirectives: parsedMeta.demographicsLogistics?.advanceDirectives || null,
        pods: {
          primary: primaryCaregiver,
          secondary1: secondary1Caregiver,
          secondary2: secondary2Caregiver,
        },
        metrics: {
          totalShifts,
          completedShifts,
          upcomingShifts,
          inProgressShifts,
          lastShiftDate: lastShift?.scheduledStart || null,
          totalInvoices: client._count.invoices,
          totalActivityLogs: client._count.activityLogs,
          carePlansCount: client.carePlans.length,
          carePlanTasksCount: client.carePlans.reduce((acc, cp) => acc + cp.tasks.length, 0),
        },
        rawMetadata: parsedMeta,
      };
    });

    // Process & Enhance Caregivers Data
    const caregivers = rawCaregivers.map((cg) => {
      let parsedMeta: any = {};
      try {
        parsedMeta = cg.profileMetadata ? JSON.parse(cg.profileMetadata) : {};
      } catch {
        parsedMeta = {};
      }

      const totalShifts = cg.assignedShifts.length;
      const completedShifts = cg.assignedShifts.filter((s) => s.status === 'COMPLETED').length;
      const droppedShifts = cg.assignedShifts.filter((s) => s.status === 'DROPPED').length;
      const noShowShifts = cg.assignedShifts.filter((s) => s.status === 'NO_SHOW').length;
      const upcomingShifts = cg.assignedShifts.filter(
        (s) => s.status === 'CONFIRMED' || s.status === 'CAREGIVER_CONFIRMED' || s.status === 'UNCONFIRMED'
      ).length;

      const validRatings = cg.reviewsReceived.filter((r) => typeof r.rating === 'number' && r.rating > 0);
      const avgRating = validRatings.length > 0
        ? parseFloat((validRatings.reduce((sum, r) => sum + (r.rating || 0), 0) / validRatings.length).toFixed(1))
        : null;

      return {
        id: cg.id,
        name: cg.name,
        email: cg.email,
        role: cg.role,
        phoneNumber: cg.phoneNumber || 'Not provided',
        payRate: cg.payRate || 0,
        latitude: cg.latitude,
        longitude: cg.longitude,
        createdAt: cg.createdAt,
        mustChangePassword: cg.mustChangePassword,
        passwordUpdatedAt: cg.passwordUpdatedAt,
        jobTitle: parsedMeta.title || (cg.role === 'ADMIN' ? 'Administrator' : 'Caregiver'),
        podAssignments: cg.podAssignments.map((pa) => ({
          clientId: pa.client.id,
          clientName: pa.client.name,
          role: pa.role,
        })),
        metrics: {
          totalShifts,
          completedShifts,
          droppedShifts,
          noShowShifts,
          upcomingShifts,
          assignedClientsCount: cg.podAssignments.length,
          reviewsCount: cg.reviewsReceived.length,
          averageRating: avgRating,
          auditLogsCount: cg._count.auditLogs,
        },
        recentReviews: cg.reviewsReceived.slice(0, 5),
      };
    });

    // Process Audits
    const audits = rawAudits.map((a) => ({
      id: a.id,
      timestamp: a.timestamp,
      action: a.action,
      details: a.details,
      outcome: a.outcome,
      userId: a.userId,
      userName: a.user?.name || 'System User',
      userEmail: a.user?.email || 'Unknown',
      userRole: a.user?.role || 'UNKNOWN',
    }));

    // Stats
    const stats = {
      totalClients: clients.length,
      totalCaregivers: caregivers.filter((c) => c.role === 'CAREGIVER').length,
      totalStaff: caregivers.length,
      totalAudits: audits.length,
      totalDigitalFootprints: digitalFootprints.length,
      totalClockIns: digitalFootprints.filter((f) => f.activityType === 'CLOCK_IN').length,
      totalCompletedVisits: clients.reduce((acc, c) => acc + c.metrics.completedShifts, 0),
      totalUpcomingVisits: clients.reduce((acc, c) => acc + c.metrics.upcomingShifts, 0),
    };

    return NextResponse.json({
      success: true,
      stats,
      clients,
      caregivers,
      audits,
      digitalFootprints,
    });
  } catch (error) {
    console.error('Failed to fetch admin directory & audits data:', error);
    return NextResponse.json(
      { error: 'Internal server error while loading directory and audits.' },
      { status: 500 }
    );
  }
}
