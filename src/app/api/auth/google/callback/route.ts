import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { isAdminEmailAllowed, isCompanyDomainEmail } from '@/lib/adminAllowlist';
import crypto from 'crypto';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, requestUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_auth_code', requestUrl.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${requestUrl.origin}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/?error=google_not_configured', requestUrl.origin));
  }

  // ── Step 1: Exchange auth code for access token ──────────────────────────
  let access_token: string;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      let googleError = 'unknown';
      try { googleError = JSON.parse(errBody)?.error || 'unknown'; } catch { /* */ }
      return NextResponse.redirect(
        new URL(`/?error=${encodeURIComponent(`token_exchange_failed: ${googleError}`)}`, requestUrl.origin)
      );
    }

    const tokenData = await tokenRes.json();
    access_token = tokenData.access_token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(`step1_failed: ${msg.slice(0, 80)}`)}`, requestUrl.origin)
    );
  }

  // ── Step 2: Fetch Google user profile ────────────────────────────────────
  let email: string;
  let name: string;
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL('/?error=profile_fetch_failed', requestUrl.origin));
    }

    const googleUser = await userRes.json();
    email = (googleUser.email || '').trim().toLowerCase();
    name = googleUser.name || googleUser.given_name || 'Google User';

    if (!email) {
      return NextResponse.redirect(new URL('/?error=email_not_provided', requestUrl.origin));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(`step2_failed: ${msg.slice(0, 80)}`)}`, requestUrl.origin)
    );
  }

  // ── Step 3: Look up or create the user in the database ───────────────────
  try {
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Auto-create admin accounts for known company emails
      if (isCompanyDomainEmail(email) && isAdminEmailAllowed(email)) {
        user = await prisma.user.create({
          data: {
            email,
            name,
            passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
            role: 'ADMIN',
          },
        });
      } else {
        // No account found — must be registered by admin first
        return NextResponse.redirect(
          new URL(
            `/?error=${encodeURIComponent('No account found for ' + email + '. Contact your administrator.')}`,
            requestUrl.origin
          )
        );
      }
    }

    // Block unauthorized admin logins via Google
    if (user.role === 'ADMIN' && !isAdminEmailAllowed(email)) {
      logAudit({ userId: user.id, action: 'ADMIN_LOGIN_DENIED', details: `Blocked Google OAuth: ${email}`, outcome: 'FAILURE' }).catch(() => {});
      return NextResponse.redirect(new URL('/?error=admin_not_authorized', requestUrl.origin));
    }

    // Log success (non-blocking)
    logAudit({ userId: user.id, action: 'OAUTH_LOGIN_SUCCESS', details: `Google OAuth: ${email} as ${user.role}`, outcome: 'SUCCESS' }).catch(() => {});

    // Create session and redirect
    const response = NextResponse.redirect(new URL('/', requestUrl.origin));
    const session = createSessionCookie(user.id);
    response.cookies.set(session.name, session.value, sessionCookieOptions(session.maxAge));
    return response;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(`step3_db_failed: ${msg.slice(0, 120)}`)}`, requestUrl.origin)
    );
  }
}
