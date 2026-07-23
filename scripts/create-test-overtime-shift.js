// One-off dev helper: creates a CONFIRMED shift for primary@akirapa.com whose
// scheduledEnd is a few seconds in the future, so the auto-clock-out timer and
// overtime UI can be exercised without waiting hours.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const caregiver = await prisma.user.findUnique({ where: { email: 'primary@akirapa.com' } });
  const client = await prisma.client.findFirst({ where: { name: 'Sarah Jenkins' } });
  if (!caregiver || !client) throw new Error('Seed data not found');

  const now = new Date();
  const scheduledStart = new Date(now.getTime() - 60 * 1000); // started 1 min ago
  const scheduledEnd = new Date(now.getTime() + 20 * 1000); // ends in 20 seconds

  const shift = await prisma.shift.create({
    data: {
      clientId: client.id,
      caregiverId: caregiver.id,
      status: 'IN_PROGRESS',
      scheduledStart,
      scheduledEnd,
      actualStart: scheduledStart,
      confirmationDeadline: scheduledStart,
      confirmedAt: scheduledStart,
    },
  });

  console.log('Created test shift:', shift.id, 'ends at', scheduledEnd.toISOString());
}

main().catch(console.error).finally(() => prisma.$disconnect());
