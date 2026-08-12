// Authorized Admin emails for Akirapa Home Care System.
// Restricted to official @akirapahomecareus.com addresses.

export const OFFICIAL_DOMAIN = 'akirapahomecareus.com';

export const DEFAULT_ALLOWED_ADMINS = [
  'info@akirapahomecareus.com',
  'alvinp@akirapahomecareus.com',
  'andrew@akirapahomecareus.com',
  'cathy@akirapahomecareus.com',
  'farid@akirapahomecareus.com',
];

export function isCompanyDomainEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${OFFICIAL_DOMAIN}`);
}

export function isAdminEmailAllowed(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();

  // Must match official company domain
  if (!isCompanyDomainEmail(normalized)) return false;

  const envAdmins = (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const allowedList = envAdmins.length > 0 ? envAdmins : DEFAULT_ALLOWED_ADMINS;
  return allowedList.includes(normalized);
}
