// Admin access is restricted to a small, explicitly authorized set of emails,
// regardless of login method (Google OAuth or email+password) or what role a
// record in the database might already have.
const ADMIN_ALLOWED_EMAILS = (process.env.ADMIN_ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmailAllowed(email: string): boolean {
  return ADMIN_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
