/**
 * Audits every existing account against the email-domain policy that now gates
 * login (see src/lib/adminAllowlist.ts):
 *
 *   ADMIN          -> allowlisted @akirapahomecareus.com address
 *   CAREGIVER      -> any @akirapahomecareus.com address
 *   FAMILY_MEMBER  -> personal @gmail.com, unless admin-provisioned
 *
 * Accounts created before the policy landed may sit outside it and would be
 * refused at their next login. Run this first to see who, then decide.
 *
 *   node scripts/audit-email-policy.js              # report only, changes nothing
 *   node scripts/audit-email-policy.js --grandfather
 *
 * --grandfather marks the non-compliant CLIENT/FAMILY accounts it lists as
 * admin-provisioned so they keep working, exactly as if a super admin had
 * issued them from the admin portal. It deliberately never touches ADMIN or
 * CAREGIVER accounts: staff addresses must genuinely move to the company
 * domain, and no flag waives the admin allowlist.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const OFFICIAL_DOMAIN = 'akirapahomecareus.com';
const CLIENT_SELF_SIGNUP_DOMAINS = ['gmail.com'];
const ALLOWED_ADMINS = [
  'info@akirapahomecareus.com',
  'andrew@akirapahomecareus.com',
  'cathy@akirapahomecareus.com',
  'farid@akirapahomecareus.com',
  'richard@akirapahomecareus.com',
];
const STAFF_ROLES = ['CAREGIVER', 'CARE_COORDINATOR'];

function domainOf(email) {
  const at = String(email || '').toLowerCase().lastIndexOf('@');
  return at > 0 ? String(email).toLowerCase().slice(at + 1) : '';
}

function verdict(user) {
  const email = String(user.email || '').toLowerCase();
  const domain = domainOf(email);

  if (user.role === 'ADMIN') {
    return ALLOWED_ADMINS.includes(email)
      ? { ok: true }
      : { ok: false, reason: 'not on the admin allowlist in src/lib/adminAllowlist.ts', fixable: false };
  }

  if (STAFF_ROLES.includes(user.role)) {
    return domain === OFFICIAL_DOMAIN
      ? { ok: true }
      : { ok: false, reason: `staff account on @${domain}, not @${OFFICIAL_DOMAIN}`, fixable: false };
  }

  if (user.isAdminProvisioned) return { ok: true };

  return CLIENT_SELF_SIGNUP_DOMAINS.includes(domain)
    ? { ok: true }
    : { ok: false, reason: `client account on @${domain}, not a personal Gmail`, fixable: true };
}

async function main() {
  const grandfather = process.argv.includes('--grandfather');

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
    select: { id: true, email: true, name: true, role: true, isAdminProvisioned: true, createdAt: true },
  });

  const blocked = [];
  for (const user of users) {
    const result = verdict(user);
    if (!result.ok) blocked.push({ user, ...result });
  }

  console.log(`\nChecked ${users.length} account(s) against the email-domain policy.`);

  if (blocked.length === 0) {
    console.log('Every account is compliant. Nothing to do.\n');
    return;
  }

  console.log(`\n${blocked.length} account(s) would be refused at next login:\n`);
  for (const entry of blocked) {
    const flag = entry.fixable ? '[grandfatherable]' : '[needs a real fix]';
    console.log(`  ${flag} ${entry.user.role.padEnd(14)} ${entry.user.email}`);
    console.log(`      ${entry.user.name} - ${entry.reason}`);
  }

  const fixable = blocked.filter(b => b.fixable);
  const manual = blocked.filter(b => !b.fixable);

  if (manual.length > 0) {
    console.log(`\n${manual.length} staff/admin account(s) cannot be waived by a flag.`);
    console.log('  - Admins: add the address to DEFAULT_ALLOWED_ADMINS and redeploy, or the person signs in under an allowlisted address.');
    console.log(`  - Caregivers: issue an @${OFFICIAL_DOMAIN} address from the admin portal and retire the old account.`);
  }

  if (!grandfather) {
    if (fixable.length > 0) {
      console.log(`\n${fixable.length} client account(s) can be kept working with:`);
      console.log('  node scripts/audit-email-policy.js --grandfather\n');
    } else {
      console.log('');
    }
    return;
  }

  if (fixable.length === 0) {
    console.log('\nNothing to grandfather.\n');
    return;
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: fixable.map(f => f.user.id) } },
    data: { isAdminProvisioned: true },
  });

  console.log(`\nMarked ${result.count} client account(s) as admin-provisioned. They keep portal access.`);
  console.log('New self-registrations are still held to the Gmail-only rule.\n');
}

main()
  .catch(err => {
    console.error('Email policy audit failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
