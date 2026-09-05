require('dotenv').config();
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Ensuring Stuart Ssemwogerere is created and assigned as SECONDARY_1 for all clients...');

  const defaultPasswordHash = bcrypt.hashSync('Akirapa2026!', 10);
  const email = 'sstuart@akirapahomecareus.com';

  const stuart = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: defaultPasswordHash,
      name: 'Stuart Ssemwogerere',
      role: UserRole.CAREGIVER,
      phoneNumber: '+13399701214',
      payRate: 28.0,
      profileMetadata: JSON.stringify({
        bio: 'Default Secondary & Immediate Backup Caregiver',
        certifications: ['Certified Nursing Assistant (CNA)', 'CPR / First Aid'],
        initialPassword: 'Akirapa2026!',
      }),
    },
    update: {
      role: UserRole.CAREGIVER,
      phoneNumber: '+13399701214',
      payRate: 28.0,
    },
  });

  console.log(`✔ Stuart Ssemwogerere account active: ${stuart.id} (${stuart.email})`);

  // Assign Stuart as SECONDARY_1 for all existing clients
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  console.log(`Found ${clients.length} existing client(s) in system.`);

  for (const client of clients) {
    await prisma.caregiverPod.upsert({
      where: {
        clientId_role: {
          clientId: client.id,
          role: 'SECONDARY_1',
        },
      },
      create: {
        clientId: client.id,
        caregiverId: stuart.id,
        role: 'SECONDARY_1',
      },
      update: {
        caregiverId: stuart.id,
      },
    });
    console.log(`   -> Auto-assigned Stuart Ssemwogerere as SECONDARY_1 for client: ${client.name}`);
  }

  console.log('✅ Done! Stuart Ssemwogerere is set as default secondary caregiver for all clients.');
}

main()
  .catch((e) => {
    console.error('Error upserting Stuart Ssemwogerere:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
