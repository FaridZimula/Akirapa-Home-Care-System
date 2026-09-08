/**
 * Adds the columns introduced with the email-domain policy and the enforced
 * clock-in geofence:
 *
 *   User.isAdminProvisioned      - exempts an admin-issued account from the
 *                                  self-signup email-domain rules
 *   Shift.clockInDistanceMeter   - metres from site centre at clock-in
 *   Shift.clockOutDistanceMeter  - metres from site centre at clock-out
 *   Shift.minutesLate            - how late the caregiver actually clocked in
 *   Shift.lateReason             - the reason they gave for that delay
 *   Shift.missedClockInAlertAt   - when the missed-clock-in alert was raised
 *
 * Every statement is additive and idempotent: each column is nullable or has a
 * default, so existing rows are untouched and re-running changes nothing.
 *
 * This exists instead of `prisma db push` because the live database still
 * carries an unused CARE_COORDINATOR value on the UserRole enum that the schema
 * no longer declares. A push would drop it as a side effect - unrelated drift
 * that should be resolved on its own terms, not silently as part of this change.
 *
 *   node scripts/migrate-add-attendance-columns.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const STATEMENTS = [
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdminProvisioned" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "clockInDistanceMeter" DOUBLE PRECISION',
  'ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "clockOutDistanceMeter" DOUBLE PRECISION',
  'ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "minutesLate" INTEGER',
  'ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "lateReason" TEXT',
  'ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "missedClockInAlertAt" TIMESTAMP(3)',
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log('OK  ' + sql);
  }

  const cols = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE (table_name = 'User'  AND column_name = 'isAdminProvisioned')
         OR (table_name = 'Shift' AND column_name IN ('clockInDistanceMeter','clockOutDistanceMeter','minutesLate','lateReason','missedClockInAlertAt'))
      ORDER BY table_name, column_name`
  );

  console.log('\nColumns now present:');
  for (const c of cols) {
    console.log(`  ${c.table_name}.${c.column_name.padEnd(22)} ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default || '-'}`);
  }
  console.log('');
}

main()
  .catch(err => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
