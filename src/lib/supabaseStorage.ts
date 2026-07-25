import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.AKIRAPA_SUPABASE_URL;
const serviceRoleKey = process.env.AKIRAPA_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('AKIRAPA_SUPABASE_URL and AKIRAPA_SUPABASE_SERVICE_ROLE_KEY environment variables must be set for media storage.');
}

if (process.env.NODE_ENV !== 'production') {
  // Some local dev machines run antivirus (e.g. Avast Mail/Web Shield) that MITMs
  // outbound TLS with a self-signed cert Node doesn't trust (same issue worked
  // around for SMTP in src/lib/email.ts). Only relax validation outside
  // production, where no such interception exists.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Service-role client, server-side only. Bypasses storage RLS - our API routes
// are responsible for access control before ever touching this client.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const MESSAGE_MEDIA_BUCKET = 'message-media';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB

export function classifyMediaType(mimeType: string): 'image' | 'video' | 'audio' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image';
}
