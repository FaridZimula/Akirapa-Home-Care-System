import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function prepProduction() {
  console.log(' Preparing database for live production launch...');

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

  // 2. Seed primary Admin Account
  const adminEmail = process.env.ADMIN_ALLOWED_EMAILS?.split(',')[0]?.trim() || 'faridzimula602@gmail.com';
  const defaultPasswordHash = bcrypt.hashSync('Akirapa2026!', 10);

  console.log(`-> Creating primary production Admin user: ${adminEmail}`);

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: defaultPasswordHash,
      name: 'System Admin',
      role: UserRole.ADMIN,
      phoneNumber: '+16045550100',
      profileMetadata: JSON.stringify({
        bio: 'Primary Clinical & System Administrator',
        certifications: ['System Admin', 'HIPAA Compliance Officer'],
      }),
    },
  });

  console.log(' Database successfully prepared for production!');
  console.log(`-> Registered Admin ID: ${admin.id}`);
  console.log(`-> Registered Admin Email: ${admin.email}`);
  console.log('-> Default Password (if logging in without Google): Akirapa2026!');
  console.log('-> Ready for real clients, caregivers, and shifts tomorrow.');
}

prepProduction()
  .catch((e) => {
    console.error(' Error during production preparation:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
