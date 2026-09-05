const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const OFFICIAL_ADMIN_ACCOUNTS = [
  { email: 'info@akirapahomecareus.com', name: 'Info Admin' },
  { email: 'andrew@akirapahomecareus.com', name: 'Andrew' },
  { email: 'cathy@akirapahomecareus.com', name: 'Cathy' },
  { email: 'farid@akirapahomecareus.com', name: 'Farid Admin' },
  { email: 'richard@akirapahomecareus.com', name: 'Richard Miyingo' },
];

async function prepProduction() {
  console.log('🚀 Preparing virgin database for live production launch...');

  // 1. Clear out demo/test activity and scheduling records
  console.log('-> Clearing mock notifications...');
  await prisma.notification.deleteMany();

  console.log('-> Clearing mock audit logs...');
  await prisma.auditLog.deleteMany();

  console.log('-> Clearing mock activity logs...');
  await prisma.activityLog.deleteMany();

  console.log('-> Clearing family links...');
  await prisma.linkedFamilyMember.deleteMany();

  console.log('-> Clearing shift tasks...');
  await prisma.shiftTask.deleteMany();

  console.log('-> Clearing caregiver location histories...');
  await prisma.caregiverLocationHistory.deleteMany();

  console.log('-> Clearing shift offers & shifts...');
  await prisma.shiftOffer.deleteMany();
  await prisma.shift.deleteMany();

  console.log('-> Clearing care plan tasks & care plans...');
  await prisma.carePlanTask.deleteMany();
  await prisma.carePlan.deleteMany();

  console.log('-> Clearing caregiver reviews & invoices...');
  await prisma.caregiverReview.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();

  console.log('-> Clearing caregiver pods...');
  await prisma.caregiverPod.deleteMany();

  console.log('-> Clearing mock clients...');
  await prisma.client.deleteMany();

  console.log('-> Clearing mock caregiver availabilities...');
  await prisma.availability.deleteMany();

  console.log('-> Clearing verification tokens...');
  await prisma.verificationToken.deleteMany();

  console.log('-> Clearing mock user accounts...');
  await prisma.user.deleteMany();

  // 2. Seed the 5 Official Production Admin Accounts
  const defaultPasswordHash = bcrypt.hashSync('Akirapa2026!', 10);

  console.log('-> Seeding 5 official @akirapahomecareus.com Admin accounts:');

  for (const account of OFFICIAL_ADMIN_ACCOUNTS) {
    const admin = await prisma.user.create({
      data: {
        email: account.email,
        passwordHash: defaultPasswordHash,
        name: account.name,
        role: UserRole.ADMIN,
        phoneNumber: '+16045550100',
        profileMetadata: JSON.stringify({
          bio: 'Clinical & System Operations Administrator',
          certifications: ['System Admin', 'HIPAA Privacy Officer'],
        }),
      },
    });
    console.log(`   ✔ Created Admin: ${admin.email} (${admin.name})`);
  }

  // Seed default Secondary Caregiver: Stuart Ssemwogerere
  const secondaryCaregiver = await prisma.user.create({
    data: {
      email: 'sstuart@akirapahomecareus.com',
      passwordHash: defaultPasswordHash,
      name: 'Stuart Ssemwogerere',
      role: UserRole.CAREGIVER,
      phoneNumber: '+13399701214',
      payRate: 28.0,
      profileMetadata: JSON.stringify({
        bio: 'Default Secondary & Immediate Backup Caregiver',
        certifications: ['Certified Nursing Assistant (CNA)', 'CPR / First Aid'],
      }),
    },
  });
  console.log(`   ✔ Created Default Secondary Caregiver: ${secondaryCaregiver.email} (${secondaryCaregiver.name})`);

  console.log('✅ Virgin database successfully initialized!');
  console.log('-> Clean slate state: 5 Admins | 0 Clients | 0 Caregivers | 0 Shifts');
  console.log('-> Default Password (if logging in without Google): Akirapa2026!');
  console.log('-> Ready for real clients, caregivers, and shifts tomorrow.');
}

prepProduction()
  .catch((e) => {
    console.error('❌ Error during production preparation:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
