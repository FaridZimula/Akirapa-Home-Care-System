// One-off migration: ActivityLog rows encrypted before ENCRYPTION_KEY was a real
// secret (src/lib/crypto.ts previously fell back to a hardcoded key) are re-encrypted
// under the new ENCRYPTION_KEY so they stay readable. Safe to re-run - rows that fail
// to decrypt under the OLD key are assumed already migrated and are skipped.
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();
const ALGORITHM = 'aes-256-gcm';

const OLD_KEY = Buffer.from('f656723d-dcf3-4586-be53-866a23bc'.substring(0, 32), 'utf-8');
const NEW_KEY = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);

function decryptWith(key, encryptedText) {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid format');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(parts[2], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptWith(key, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

async function main() {
  const logs = await prisma.activityLog.findMany({ select: { id: true, encryptedLog: true } });

  let migrated = 0;
  for (const log of logs) {
    let plaintext;
    try {
      plaintext = decryptWith(OLD_KEY, log.encryptedLog);
    } catch {
      continue; // Already under the new key (or unrecoverable) - leave as is.
    }

    const reencrypted = encryptWith(NEW_KEY, plaintext);
    await prisma.activityLog.update({ where: { id: log.id }, data: { encryptedLog: reencrypted } });
    migrated++;
  }

  console.log(`Done. Re-encrypted ${migrated} of ${logs.length} activity log(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
