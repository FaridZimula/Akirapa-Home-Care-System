import { PrismaClient, UserRole, ShiftStatus, PodRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing data
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
  await prisma.user.deleteMany();

  // Create Users
  const admin = await prisma.user.create({
    data: {
      email: 'admin@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Elena Rostova',
      role: UserRole.ADMIN,
      phoneNumber: '+16045550101',
    },
  });

  const coordinator = await prisma.user.create({
    data: {
      email: 'coordinator@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Grace Taylor',
      role: UserRole.CARE_COORDINATOR,
      phoneNumber: '+16045550102',
    },
  });

  const primaryCaregiver = await prisma.user.create({
    data: {
      email: 'primary@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Amara Okafor',
      role: UserRole.CAREGIVER,
      phoneNumber: '+16045550103',
    },
  });

  const backupCaregiver1 = await prisma.user.create({
    data: {
      email: 'backup1@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Brendan Miller',
      role: UserRole.CAREGIVER,
      phoneNumber: '+16045550104',
    },
  });

  const backupCaregiver2 = await prisma.user.create({
    data: {
      email: 'backup2@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'Chloe Chen',
      role: UserRole.CAREGIVER,
      phoneNumber: '+16045550105',
    },
  });

  const familyMember = await prisma.user.create({
    data: {
      email: 'family@akirapa.com',
      passwordHash: 'akirapa2634!',
      name: 'David Jenkins',
      role: UserRole.FAMILY_MEMBER,
      phoneNumber: '+16045550106',
    },
  });


  // Create Client
  const client = await prisma.client.create({
    data: {
      name: 'Sarah Jenkins',
      address: '750 Burrard St, Vancouver, BC V6Z 2H7',
      latitude: 49.2827,  // Vancouver center location for simulation
      longitude: -123.1207,
      geofenceRadiusMeter: 150,
    },
  });

  // Assign Caregiver Pod
  await prisma.caregiverPod.create({
    data: {
      clientId: client.id,
      caregiverId: primaryCaregiver.id,
      role: PodRole.PRIMARY,
    },
  });

  await prisma.caregiverPod.create({
    data: {
      clientId: client.id,
      caregiverId: backupCaregiver1.id,
      role: PodRole.SECONDARY_1,
    },
  });

  await prisma.caregiverPod.create({
    data: {
      clientId: client.id,
      caregiverId: backupCaregiver2.id,
      role: PodRole.SECONDARY_2,
    },
  });

  // Link Family Member
  await prisma.linkedFamilyMember.create({
    data: {
      clientId: client.id,
      userId: familyMember.id,
    },
  });

  // Create Care Plan
  const carePlan = await prisma.carePlan.create({
    data: {
      clientId: client.id,
    },
  });

  await prisma.carePlanTask.createMany({
    data: [
      {
        carePlanId: carePlan.id,
        taskName: 'Morning Medication',
        description: 'Administer 2 tablets of blood pressure medication (Lisinopril 10mg) with water',
        scheduledTime: '08:00 AM',
        isMandatory: true,
      },
      {
        carePlanId: carePlan.id,
        taskName: 'Prepare Breakfast',
        description: 'Warm oatmeal with fresh berries and decaf tea. Help client sit up.',
        scheduledTime: '08:30 AM',
        isMandatory: true,
      },
      {
        carePlanId: carePlan.id,
        taskName: 'Light Walk',
        description: 'Assist with walker for a 15-minute walk in the garden or living room.',
        scheduledTime: '10:30 AM',
        isMandatory: false,
      },
      {
        carePlanId: carePlan.id,
        taskName: 'Lunch Preparation',
        description: 'Grilled chicken salad and hydration check (ensure 500ml water consumption).',
        scheduledTime: '12:30 PM',
        isMandatory: true,
      },
    ],
  });

  // Create Shifts
  const now = new Date();

  // Shift 1: Completed Shift (Yesterday)
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(now.getDate() - 1);
  yesterdayStart.setHours(9, 0, 0, 0);

  const yesterdayEnd = new Date(now);
  yesterdayEnd.setDate(now.getDate() - 1);
  yesterdayEnd.setHours(14, 0, 0, 0);

  const completedShift = await prisma.shift.create({
    data: {
      clientId: client.id,
      caregiverId: primaryCaregiver.id,
      status: ShiftStatus.COMPLETED,
      scheduledStart: yesterdayStart,
      scheduledEnd: yesterdayEnd,
      actualStart: yesterdayStart,
      actualEnd: yesterdayEnd,
      confirmationDeadline: yesterdayStart,
      confirmedAt: yesterdayStart,
      clockInLat: 49.2826,
      clockInLng: -123.1206,
      clockOutLat: 49.2827,
      clockOutLng: -123.1207,
    },
  });

  await prisma.shiftTask.createMany({
    data: [
      {
        shiftId: completedShift.id,
        taskName: 'Morning Medication',
        description: 'Administer 2 tablets of blood pressure medication (Lisinopril 10mg) with water',
        scheduledTime: '08:00 AM',
        isCompleted: true,
        completedAt: yesterdayStart,
      },
      {
        shiftId: completedShift.id,
        taskName: 'Prepare Breakfast',
        description: 'Warm oatmeal with fresh berries and decaf tea. Help client sit up.',
        scheduledTime: '08:30 AM',
        isCompleted: true,
        completedAt: yesterdayStart,
      },
    ],
  });

  // Shift 2: Today's Shift (starts in 2 hours)
  const todayStart = new Date(now);
  todayStart.setHours(now.getHours() + 2, 0, 0, 0);

  const todayEnd = new Date(now);
  todayEnd.setHours(now.getHours() + 7, 0, 0, 0);

  const activeShift = await prisma.shift.create({
    data: {
      clientId: client.id,
      caregiverId: primaryCaregiver.id,
      status: ShiftStatus.CONFIRMED,
      scheduledStart: todayStart,
      scheduledEnd: todayEnd,
      confirmationDeadline: new Date(todayStart.getTime() - 2 * 60 * 60 * 1000), // 2 hours before
      confirmedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    },
  });

  await prisma.shiftTask.createMany({
    data: [
      {
        shiftId: activeShift.id,
        taskName: 'Morning Medication',
        description: 'Administer 2 tablets of blood pressure medication (Lisinopril 10mg) with water',
        scheduledTime: '08:00 AM',
        isCompleted: false,
      },
      {
        shiftId: activeShift.id,
        taskName: 'Prepare Breakfast',
        description: 'Warm oatmeal with fresh berries and decaf tea. Help client sit up.',
        scheduledTime: '08:30 AM',
        isCompleted: false,
      },
      {
        shiftId: activeShift.id,
        taskName: 'Light Walk',
        description: 'Assist with walker for a 15-minute walk in the garden or living room.',
        scheduledTime: '10:30 AM',
        isCompleted: false,
      },
      {
        shiftId: activeShift.id,
        taskName: 'Lunch Preparation',
        description: 'Grilled chicken salad and hydration check (ensure 500ml water consumption).',
        scheduledTime: '12:30 PM',
        isCompleted: false,
      },
    ],
  });

  // Shift 3: Tomorrow's Unconfirmed Shift (starts in 23 hours - TARGET FOR ESCALATION)
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(now.getDate() + 1);
  tomorrowStart.setHours(9, 0, 0, 0);

  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(now.getDate() + 1);
  tomorrowEnd.setHours(14, 0, 0, 0);

  await prisma.shift.create({
    data: {
      clientId: client.id,
      caregiverId: primaryCaregiver.id, // Primary caregiver
      status: ShiftStatus.UNCONFIRMED,
      scheduledStart: tomorrowStart,
      scheduledEnd: tomorrowEnd,
      confirmationDeadline: new Date(tomorrowStart.getTime() - 24 * 60 * 60 * 1000), // 24 hours before (i.e. now!)
    },
  });

  // Create Availability records
  const availabilityData = [
    // Amara Okafor (Mon-Fri 8am-5pm)
    ...[1, 2, 3, 4, 5].map(day => ({
      caregiverId: primaryCaregiver.id,
      dayOfWeek: day,
      startTime: '08:00',
      endTime: '17:00',
    })),
    // Brendan Miller (Mon-Fri 8am-8pm)
    ...[1, 2, 3, 4, 5].map(day => ({
      caregiverId: backupCaregiver1.id,
      dayOfWeek: day,
      startTime: '08:00',
      endTime: '20:00',
    })),
    // Chloe Chen (Sat-Sun 8am-10pm)
    ...[0, 6].map(day => ({
      caregiverId: backupCaregiver2.id,
      dayOfWeek: day,
      startTime: '08:00',
      endTime: '22:00',
    })),
  ];

  await prisma.availability.deleteMany();
  await prisma.availability.createMany({
    data: availabilityData,
  });

  console.log('Database successfully seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
