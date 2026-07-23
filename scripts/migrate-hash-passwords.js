// One-off migration: hash any User.passwordHash values that are still plaintext
// (left over from before login/register hashed with bcrypt). Safe to re-run -
// already-bcrypt-hashed rows are skipped.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } });

  let migrated = 0;
  for (const user of users) {
    if (BCRYPT_PATTERN.test(user.passwordHash)) continue;

    const hashed = await bcrypt.hash(user.passwordHash, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashed } });
    console.log(`Hashed password for ${user.email}`);
    migrated++;
  }

  console.log(`Done. Migrated ${migrated} of ${users.length} user(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
