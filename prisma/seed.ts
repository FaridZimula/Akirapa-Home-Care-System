import { PrismaClient, UserRole, ShiftStatus, PodRole } from '@prisma/client';
import { encrypt } from '../src/lib/crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding rich database demo records...');

  // 1. Clean existing database tables
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.linkedFamilyMember.deleteMany();
  await prisma.shiftTask.deleteMany();
  await prisma.caregiverLocationHistory.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.carePlanTask.deleteMany();
  await prisma.carePlan.deleteMany();
  await prisma.caregiverPod.deleteMany();
  await prisma.client.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Users (Admins, Coordinators, Caregivers, Family Members)
  const admin = await prisma.user.create({
    data: {
      email: 'admin@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Elena Rostova',
      role: UserRole.ADMIN,
      phoneNumber: '+16045550101',
      profileMetadata: JSON.stringify({
        bio: 'Senior Clinical Operations Director with 12+ years in Home Care Systems administration.',
        certifications: ['Healthcare Admin Certified', 'HIPAA Privacy Officer'],
      }),
    },
  });

  const coordinator = await prisma.user.create({
    data: {
      email: 'coordinator@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Grace Taylor',
      role: UserRole.CARE_COORDINATOR,
      phoneNumber: '+16045550102',
      profileMetadata: JSON.stringify({
        bio: 'Care Logistics Coordinator specializing in automated shift matching & emergency backups.',
        certifications: ['CPR/BLS Certified', 'Care Coordination License'],
      }),
    },
  });

  // Caregivers
  const caregiverAmara = await prisma.user.create({
    data: {
      email: 'primary@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Amara Okafor',
      role: UserRole.CAREGIVER,
      phoneNumber: '+16045550103',
      profileMetadata: JSON.stringify({
        bio: 'Compassionate Certified Nursing Assistant with 7 years of specialized elderly memory care experience.',
        certifications: ['CPR / BLS Certified', 'Certified Nursing Assistant (CNA)', 'Alzheimer\'s & Dementia Specialist'],
        specialties: 'Memory Care, Elderly Mobility, Hydration Management',
      }),
    },
  });

  const caregiverBrendan = await prisma.user.create({
    data: {
      email: 'backup1@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Brendan Miller',
      role: UserRole.CAREGIVER,
      phoneNumber: '+16045550104',
      profileMetadata: JSON.stringify({
        bio: 'Licensed Practical Nurse specializing in post-stroke rehabilitation and vital sign monitoring.',
        certifications: ['Licensed Practical Nurse (LPN)', 'First Aid Certified', 'Medication Administration'],
        specialties: 'Post-Op Rehab, Vital Sign Telemetry, Stroke Recovery Care',
      }),
    },
  });

  const caregiverChloe = await prisma.user.create({
    data: {
      email: 'backup2@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Chloe Chen',
      role: UserRole.CAREGIVER,
      phoneNumber: '+16045550105',
      profileMetadata: JSON.stringify({
        bio: 'Dedicated home health caregiver with expertise in palliative care and nutrition preparation.',
        certifications: ['CPR / BLS Certified', 'First Aid Certified'],
        specialties: 'Palliative Comfort, Nutritional Meal Prep, Daily Assistance',
      }),
    },
  });

  const caregiverDerrick = await prisma.user.create({
    data: {
      email: 'derrick@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Derrick Vance',
      role: UserRole.CAREGIVER,
      phoneNumber: '+16045550107',
      profileMetadata: JSON.stringify({
        bio: 'Physical Therapy Assistant focused on mobility maintenance and fall prevention strategies.',
        certifications: ['Certified Nursing Assistant (CNA)', 'Physical Therapy Aide'],
        specialties: 'Gait Training, Fall Prevention, Transfer Assistance',
      }),
    },
  });

  // Family Members
  const familyDavid = await prisma.user.create({
    data: {
      email: 'family@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'David Jenkins',
      role: UserRole.FAMILY_MEMBER,
      phoneNumber: '+16045550106',
    },
  });

  const familyClara = await prisma.user.create({
    data: {
      email: 'clara@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Clara Montgomery',
      role: UserRole.FAMILY_MEMBER,
      phoneNumber: '+16045550108',
    },
  });

  const familyMarcus = await prisma.user.create({
    data: {
      email: 'marcus@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Marcus Vance',
      role: UserRole.FAMILY_MEMBER,
      phoneNumber: '+16045550109',
    },
  });

  // 3. Create Clients (Patients)
  const clientSarah = await prisma.client.create({
    data: {
      name: 'Sarah Jenkins',
      address: '750 Burrard St, Vancouver, BC V6Z 2H7',
      latitude: 49.2827,
      longitude: -123.1207,
      geofenceRadiusMeter: 150,
      profileMetadata: JSON.stringify({
        medicalConditions: 'Hypertension, Mild Arthritis, Early Stage Dementia',
        emergencyContact: 'Son David Jenkins (+1-604-555-0106)',
        allergiesNotes: 'No known drug allergies (NKDA). Prefers morning garden walks.',
      }),
    },
  });

  const clientRobert = await prisma.client.create({
    data: {
      name: 'Robert Montgomery',
      address: '1055 W Georgia St, Vancouver, BC V6E 3P3',
      latitude: 49.2845,
      longitude: -123.1215,
      geofenceRadiusMeter: 200,
      profileMetadata: JSON.stringify({
        medicalConditions: 'Post-Stroke Hemiparesis, Speech Aphasia',
        emergencyContact: 'Daughter Clara Montgomery (+1-604-555-0108)',
        allergiesNotes: 'Penicillin Allergy. Requires assistance with right-sided transfers.',
      }),
    },
  });

  const clientEleanor = await prisma.client.create({
    data: {
      name: 'Eleanor Vance',
      address: '1128 W Hastings St, Vancouver, BC V6E 4NG',
      latitude: 49.2882,
      longitude: -123.1189,
      geofenceRadiusMeter: 100,
      profileMetadata: JSON.stringify({
        medicalConditions: 'Type 2 Diabetes Mellitus, Osteoarthritis',
        emergencyContact: 'Nephew Marcus Vance (+1-604-555-0109)',
        allergiesNotes: 'Sulfa drugs. Glucose monitoring required twice daily.',
      }),
    },
  });

  // 4. Assign Caregiver Pods
  await prisma.caregiverPod.createMany({
    data: [
      // Sarah Jenkins Pod
      { clientId: clientSarah.id, caregiverId: caregiverAmara.id, role: PodRole.PRIMARY },
      { clientId: clientSarah.id, caregiverId: caregiverBrendan.id, role: PodRole.SECONDARY_1 },
      { clientId: clientSarah.id, caregiverId: caregiverChloe.id, role: PodRole.SECONDARY_2 },
      // Robert Montgomery Pod
      { clientId: clientRobert.id, caregiverId: caregiverBrendan.id, role: PodRole.PRIMARY },
      { clientId: clientRobert.id, caregiverId: caregiverDerrick.id, role: PodRole.SECONDARY_1 },
      // Eleanor Vance Pod
      { clientId: clientEleanor.id, caregiverId: caregiverChloe.id, role: PodRole.PRIMARY },
      { clientId: clientEleanor.id, caregiverId: caregiverAmara.id, role: PodRole.SECONDARY_1 },
    ],
  });

  // 5. Link Family Members to Clients
  await prisma.linkedFamilyMember.createMany({
    data: [
      { clientId: clientSarah.id, userId: familyDavid.id },
      { clientId: clientRobert.id, userId: familyClara.id },
      { clientId: clientEleanor.id, userId: familyMarcus.id },
    ],
  });

  // 6. Create Care Plans & Tasks
  const carePlanSarah = await prisma.carePlan.create({ data: { clientId: clientSarah.id } });
  await prisma.carePlanTask.createMany({
    data: [
      { carePlanId: carePlanSarah.id, taskName: 'Morning Medication', description: 'Administer Lisinopril 10mg with full glass of water', scheduledTime: '08:00 AM', isMandatory: true },
      { carePlanId: carePlanSarah.id, taskName: 'Nutritional Breakfast', description: 'Warm oatmeal with berries and decaf tea', scheduledTime: '08:30 AM', isMandatory: true },
      { carePlanId: carePlanSarah.id, taskName: 'Garden Walk', description: 'Assist with walker for 15-minute garden walk', scheduledTime: '10:30 AM', isMandatory: false },
      { carePlanId: carePlanSarah.id, taskName: 'Hydration Check', description: 'Ensure 500ml water consumption & log mood', scheduledTime: '01:00 PM', isMandatory: true },
    ],
  });

  const carePlanRobert = await prisma.carePlan.create({ data: { clientId: clientRobert.id } });
  await prisma.carePlanTask.createMany({
    data: [
      { carePlanId: carePlanRobert.id, taskName: 'Vital Signs Monitor', description: 'Measure & log BP, heart rate, and oxygen saturation', scheduledTime: '09:00 AM', isMandatory: true },
      { carePlanId: carePlanRobert.id, taskName: 'Physical Therapy Exercises', description: 'Assist with passive range of motion right-arm exercises', scheduledTime: '11:00 AM', isMandatory: true },
      { carePlanId: carePlanRobert.id, taskName: 'Lunch & Speech Practice', description: 'Pureed meal prep & 10 min speech flashcard exercise', scheduledTime: '12:30 PM', isMandatory: false },
    ],
  });

  // 7. Create Shifts across past, active, and upcoming dates
  const now = new Date();

  // Active Shift (IN_PROGRESS) for Sarah Jenkins
  const shiftInProgressStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const shiftInProgressEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const activeShift = await prisma.shift.create({
    data: {
      clientId: clientSarah.id,
      caregiverId: caregiverAmara.id,
      status: ShiftStatus.IN_PROGRESS,
      scheduledStart: shiftInProgressStart,
      scheduledEnd: shiftInProgressEnd,
      actualStart: shiftInProgressStart,
      confirmationDeadline: new Date(shiftInProgressStart.getTime() - 4 * 60 * 60 * 1000),
      confirmedAt: new Date(shiftInProgressStart.getTime() - 5 * 60 * 60 * 1000),
      clockInLat: 49.2826,
      clockInLng: -123.1206,
    },
  });

  // GPS Location History for Active Shift
  await prisma.caregiverLocationHistory.createMany({
    data: [
      { shiftId: activeShift.id, latitude: 49.2825, longitude: -123.1205, timestamp: new Date(now.getTime() - 110 * 60 * 1000) },
      { shiftId: activeShift.id, latitude: 49.2826, longitude: -123.1206, timestamp: new Date(now.getTime() - 60 * 60 * 1000) },
      { shiftId: activeShift.id, latitude: 49.2827, longitude: -123.1207, timestamp: new Date(now.getTime() - 15 * 60 * 1000) },
    ],
  });

  // Shift Tasks for Active Shift
  await prisma.shiftTask.createMany({
    data: [
      { shiftId: activeShift.id, taskName: 'Morning Medication', description: 'Administer Lisinopril 10mg with full glass of water', scheduledTime: '08:00 AM', isCompleted: true, completedAt: new Date(now.getTime() - 90 * 60 * 1000) },
      { shiftId: activeShift.id, taskName: 'Nutritional Breakfast', description: 'Warm oatmeal with berries and decaf tea', scheduledTime: '08:30 AM', isCompleted: true, completedAt: new Date(now.getTime() - 60 * 60 * 1000) },
      { shiftId: activeShift.id, taskName: 'Garden Walk', description: 'Assist with walker for 15-minute garden walk', scheduledTime: '10:30 AM', isCompleted: false },
      { shiftId: activeShift.id, taskName: 'Hydration Check', description: 'Ensure 500ml water consumption & log mood', scheduledTime: '01:00 PM', isCompleted: false },
    ],
  });

  // Completed Shift for Robert Montgomery
  const pastStart = new Date(now.getTime() - 28 * 60 * 60 * 1000);
  const pastEnd = new Date(now.getTime() - 22 * 60 * 60 * 1000);

  const completedShift = await prisma.shift.create({
    data: {
      clientId: clientRobert.id,
      caregiverId: caregiverBrendan.id,
      status: ShiftStatus.COMPLETED,
      scheduledStart: pastStart,
      scheduledEnd: pastEnd,
      actualStart: pastStart,
      actualEnd: pastEnd,
      confirmationDeadline: new Date(pastStart.getTime() - 4 * 60 * 60 * 1000),
      confirmedAt: new Date(pastStart.getTime() - 6 * 60 * 60 * 1000),
      clockInLat: 49.2845,
      clockInLng: -123.1215,
      clockOutLat: 49.2846,
      clockOutLng: -123.1216,
    },
  });

  // Confirmed Upcoming Shift for Eleanor Vance
  const upcomingStart = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  const upcomingEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await prisma.shift.create({
    data: {
      clientId: clientEleanor.id,
      caregiverId: caregiverChloe.id,
      status: ShiftStatus.CONFIRMED,
      scheduledStart: upcomingStart,
      scheduledEnd: upcomingEnd,
      confirmationDeadline: new Date(upcomingStart.getTime() - 4 * 60 * 60 * 1000),
      confirmedAt: new Date(),
    },
  });

  // Unconfirmed Shift for Escalation Test
  const unconfirmedStart = new Date(now.getTime() + 30 * 60 * 60 * 1000);
  const unconfirmedEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  await prisma.shift.create({
    data: {
      clientId: clientSarah.id,
      caregiverId: caregiverAmara.id,
      status: ShiftStatus.UNCONFIRMED,
      scheduledStart: unconfirmedStart,
      scheduledEnd: unconfirmedEnd,
      confirmationDeadline: new Date(now.getTime() - 1 * 60 * 60 * 1000), // Deadline passed 1 hour ago
    },
  });

  // 8. Create Family Activity Logs (Captioned Photos & Videos)
  const sampleLogDetails1 = {
    notes: 'Sarah had a wonderful morning! We completed her 15-minute garden walk in high spirits and she enjoyed her warm oatmeal.',
    hasRedFlags: false,
    caregiverName: 'Amara Okafor',
    wellness: { mood: 'Cheerful', appetite: 'Good (Full Meal)', hydration: 'Optimal (750ml)', sleep: 'Restful (8h)' },
    mediaFiles: [
      { name: 'morning_garden_walk.jpg', type: 'image/jpeg', url: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=800&q=80' },
      { name: 'breakfast_tea.jpg', type: 'image/jpeg', url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80' },
    ],
  };

  const sampleLogDetails2 = {
    notes: 'Robert performed all right-arm physical therapy exercises with great effort. Blood pressure normal at 122/80 mmHg.',
    hasRedFlags: false,
    caregiverName: 'Brendan Miller',
    wellness: { mood: 'Calm & Happy', appetite: 'Moderate', hydration: 'Good', sleep: 'Restful' },
    mediaFiles: [
      { name: 'physical_therapy_session.mp4', type: 'video/mp4', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
    ],
  };

  await prisma.activityLog.create({
    data: {
      clientId: clientSarah.id,
      shiftId: activeShift.id,
      encryptedLog: encrypt(JSON.stringify(sampleLogDetails1)),
      mediaUrls: JSON.stringify(['https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=800&q=80']),
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
    },
  });

  await prisma.activityLog.create({
    data: {
      clientId: clientRobert.id,
      shiftId: completedShift.id,
      encryptedLog: encrypt(JSON.stringify(sampleLogDetails2)),
      mediaUrls: JSON.stringify(['https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4']),
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    },
  });

  // 9. Create System Audit Logs
  await prisma.auditLog.createMany({
    data: [
      { userId: caregiverAmara.id, action: 'CLOCK_IN', details: 'Caregiver Amara Okafor clocked in within 20m of client Sarah Jenkins home geofence.', outcome: 'SUCCESS', timestamp: shiftInProgressStart },
      { userId: caregiverAmara.id, action: 'UPDATE_TASK', details: 'Shift task "Morning Medication" marked completed.', outcome: 'SUCCESS', timestamp: new Date(now.getTime() - 90 * 60 * 1000) },
      { userId: coordinator.id, action: 'CREATE_CARE_PLAN_TASK', details: 'Care coordinator Grace Taylor added PT task to Robert Montgomery care plan.', outcome: 'SUCCESS', timestamp: new Date(now.getTime() - 120 * 60 * 1000) },
      { userId: admin.id, action: 'UPDATE_GEOFENCE', details: 'Admin Elena Rostova updated Sarah Jenkins geofence radius to 150m.', outcome: 'SUCCESS', timestamp: new Date(now.getTime() - 180 * 60 * 1000) },
    ],
  });

  // 10. Create Caregiver Availability Schedules
  const availabilityData = [
    // Amara Okafor (Mon-Fri 8am-5pm)
    ...[1, 2, 3, 4, 5].map(day => ({ caregiverId: caregiverAmara.id, dayOfWeek: day, startTime: '08:00', endTime: '17:00' })),
    // Brendan Miller (Mon-Fri 8am-8pm)
    ...[1, 2, 3, 4, 5].map(day => ({ caregiverId: caregiverBrendan.id, dayOfWeek: day, startTime: '08:00', endTime: '20:00' })),
    // Chloe Chen (Sat-Sun 8am-10pm)
    ...[0, 6].map(day => ({ caregiverId: caregiverChloe.id, dayOfWeek: day, startTime: '08:00', endTime: '22:00' })),
    // Derrick Vance (Mon-Thu 9am-6pm)
    ...[1, 2, 3, 4].map(day => ({ caregiverId: caregiverDerrick.id, dayOfWeek: day, startTime: '09:00', endTime: '18:00' })),
  ];

  await prisma.availability.createMany({ data: availabilityData });

  console.log('Successfully populated database with rich demo records!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
