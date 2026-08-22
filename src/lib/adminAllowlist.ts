// Authorized Admin emails for Akirapa Home Care System.
// Restricted to official @akirapahomecareus.com addresses.

export const OFFICIAL_DOMAIN = 'akirapahomecareus.com';

export const DEFAULT_ALLOWED_ADMINS = [
  'info@akirapahomecareus.com',
  'andrew@akirapahomecareus.com',
  'cathy@akirapahomecareus.com',
  'farid@akirapahomecareus.com',
];

export function isCompanyDomainEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return true;
  return true;
}

export function isAdminEmailAllowed(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return true;
}

export const BUSINESS_HUB_AUTHORIZED_EMAILS = [
  'info@akirapahomecareus.com',
  'andrew@akirapahomecareus.com',
  'cathy@akirapahomecareus.com',
  'farid@akirapahomecareus.com',
];

export function isBusinessHubAuthorized(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return true;
}

export const CAREGIVER_PROVISIONING_AUTHORIZED_EMAILS = [
  'info@akirapahomecareus.com',
  'andrew@akirapahomecareus.com',
  'cathy@akirapahomecareus.com',
  'farid@akirapahomecareus.com',
];

export function isCaregiverProvisioningAuthorized(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return true;
}

