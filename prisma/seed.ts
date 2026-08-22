import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const OFFICIAL_ADMIN_ACCOUNTS = [
  { email: 'info@akirapahomecareus.com', name: 'Info Admin' },
  { email: 'andrew@akirapahomecareus.com', name: 'Andrew' },
  { email: 'cathy@akirapahomecareus.com', name: 'Cathy' },
  { email: 'farid@akirapahomecareus.com', name: 'Farid Admin' },
];

async function main() {
  console.log('Seeding official @akirapahomecareus.com production Admin accounts...');

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

  const defaultPasswordHash = bcrypt.hashSync('Akirapa2026!', 10);

  for (const account of OFFICIAL_ADMIN_ACCOUNTS) {
    await prisma.user.create({
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
  }

  console.log('Official seed complete: 5 Admin accounts seeded, 0 demo data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
