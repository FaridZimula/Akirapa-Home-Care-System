// Email access policy for the Akirapa Home Care System.
//
// Three tiers, in order of privilege:
//   1. ADMIN      - must be an official @akirapahomecareus.com address AND appear
//                   in DEFAULT_ALLOWED_ADMINS below.
//   2. CAREGIVER  - must be an official @akirapahomecareus.com address.
//   3. FAMILY_MEMBER (client portal) - may self-register with a personal Gmail
//                   address only. Any other address - including other companies'
//                   professional domains - can only be issued by a super admin
//                   from the admin portal (User.isAdminProvisioned).

export const OFFICIAL_DOMAIN = 'akirapahomecareus.com';

// Personal-email domains accepted for client/family self-registration.
export const CLIENT_SELF_SIGNUP_DOMAINS = ['gmail.com'];

export const DEFAULT_ALLOWED_ADMINS = [
  'info@akirapahomecareus.com',
  'andrew@akirapahomecareus.com',
  'cathy@akirapahomecareus.com',
  'farid@akirapahomecareus.com',
  'richard@akirapahomecareus.com',
];

function normalize(email: unknown): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/** The domain part of an email, lowercased. Empty string if malformed. */
export function emailDomain(email: string): string {
  const normalized = normalize(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return '';
  return normalized.slice(at + 1);
}

/** True for official @akirapahomecareus.com staff addresses. */
export function isCompanyDomainEmail(email: string): boolean {
  return emailDomain(email) === OFFICIAL_DOMAIN;
}

/** True for the personal-email domains the client portal accepts at self-signup. */
export function isClientSelfSignupEmail(email: string): boolean {
  return CLIENT_SELF_SIGNUP_DOMAINS.includes(emailDomain(email));
}

/**
 * Admin access. The address must be on the official domain *and* named in the
 * allowlist - membership is deliberately code-only, so adding or removing an
 * admin is a reviewable, deployable change rather than an invisible env var.
 */
export function isAdminEmailAllowed(email: string): boolean {
  const normalized = normalize(email);
  if (!normalized) return false;
  return isCompanyDomainEmail(normalized) && DEFAULT_ALLOWED_ADMINS.includes(normalized);
}

export const BUSINESS_HUB_AUTHORIZED_EMAILS = DEFAULT_ALLOWED_ADMINS;

export function isBusinessHubAuthorized(email: string): boolean {
  return isAdminEmailAllowed(email);
}

export const CAREGIVER_PROVISIONING_AUTHORIZED_EMAILS = DEFAULT_ALLOWED_ADMINS;

export function isCaregiverProvisioningAuthorized(email: string): boolean {
  return isAdminEmailAllowed(email);
}

export type PolicyRole = string;

/** Roles held by Akirapa staff, who must be on the official company domain. */
const STAFF_ROLES = ['CAREGIVER', 'CARE_COORDINATOR'];

export interface EmailPolicyResult {
  ok: boolean;
  error?: string;
}

/**
 * Whether `email` may hold `role` through public self-registration.
 * Admin-provisioned accounts skip this check entirely - see isEmailAllowedForRole.
 */
export function isSelfSignupAllowed(role: PolicyRole, email: string): EmailPolicyResult {
  const normalized = normalize(email);
  if (!normalized || !emailDomain(normalized)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  if (role === 'ADMIN') {
    return { ok: false, error: 'Admin portal accounts cannot be created via registration.' };
  }

  if (STAFF_ROLES.includes(role)) {
    if (!isCompanyDomainEmail(normalized)) {
      return {
        ok: false,
        error: `Caregiver accounts require an official @${OFFICIAL_DOMAIN} email address. Contact your administrator to have one issued.`,
      };
    }
    return { ok: true };
  }

  // FAMILY_MEMBER - the client portal.
  if (!isClientSelfSignupEmail(normalized)) {
    const accepted = CLIENT_SELF_SIGNUP_DOMAINS.map(d => `@${d}`).join(' or ');
    return {
      ok: false,
      error: `The client portal accepts personal ${accepted} addresses for self-registration. Any other address must be set up for you by an Akirapa administrator.`,
    };
  }
  return { ok: true };
}

/**
 * Whether an existing account may sign in. Same domain policy as self-signup,
 * except that an account a super admin provisioned from the admin portal is
 * trusted on any domain - that is the documented escape hatch for corporate
 * client contacts, agencies, and partner staff.
 */
export function isEmailAllowedForRole(
  role: PolicyRole,
  email: string,
  isAdminProvisioned: boolean
): EmailPolicyResult {
  const normalized = normalize(email);

  if (role === 'ADMIN') {
    // Never waived: the admin allowlist is the last line of defence.
    if (!isAdminEmailAllowed(normalized)) {
      return { ok: false, error: 'This email is not authorized for admin access.' };
    }
    return { ok: true };
  }

  if (isAdminProvisioned) return { ok: true };

  if (STAFF_ROLES.includes(role)) {
    if (!isCompanyDomainEmail(normalized)) {
      return {
        ok: false,
        error: `Caregiver access requires an official @${OFFICIAL_DOMAIN} email address. Contact your administrator.`,
      };
    }
    return { ok: true };
  }

  if (!isClientSelfSignupEmail(normalized)) {
    return {
      ok: false,
      error: 'This email is not authorized for portal access. Contact your Akirapa administrator to have your account set up.',
    };
  }
  return { ok: true };
}
