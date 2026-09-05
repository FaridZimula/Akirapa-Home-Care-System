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

async function main() {
  console.log('Seeding official @akirapahomecareus.com production Admin accounts...');

  // 1. Clean existing database tables
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.linkedFamilyMember.deleteMany();
  await prisma.shiftTask.deleteMany();
  await prisma.caregiverLocationHistory.deleteMany();
  await prisma.shiftOffer.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.carePlanTask.deleteMany();
  await prisma.carePlan.deleteMany();
  await prisma.caregiverReview.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.caregiverPod.deleteMany();
  await prisma.client.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create the 5 official Admin accounts
  const defaultPasswordHash = bcrypt.hashSync('Akirapa2026!', 10);

  for (const account of OFFICIAL_ADMIN_ACCOUNTS) {
    await prisma.user.create({
      data: {
        email: account.email,
        passwordHash: defaultPasswordHash,
        name: account.name,
        role: UserRole.ADMIN,
        phoneNumber: null,
        profileMetadata: JSON.stringify({
          bio: 'Clinical & System Operations Administrator',
          certifications: ['System Admin', 'HIPAA Privacy Officer'],
        }),
      },
    });
  }

  // Seed default Secondary Caregiver: Stuart Ssemwogerere
  await prisma.user.create({
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

  console.log('Official seed complete: 5 Admin accounts + 1 Default Backup Caregiver seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
