import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { isAdminEmailAllowed, isCompanyDomainEmail, OFFICIAL_DOMAIN } from '@/lib/adminAllowlist';
import crypto from 'crypto';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');

  if (error) {
    console.error('Google OAuth redirect error:', error);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, requestUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_auth_code', requestUrl.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${requestUrl.origin}/api/auth/google/callback`;

  try {
    // Exchange Auth Code for Tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId ?? '',
        client_secret: clientSecret ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Failed to exchange Google OAuth code:', errBody);
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', requestUrl.origin));
    }

    const { access_token } = await tokenRes.json();

    // Fetch User Profile Info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      console.error('Failed to fetch Google user profile details');
      return NextResponse.redirect(new URL('/?error=profile_fetch_failed', requestUrl.origin));
    }

    const googleUser = await userRes.json();
    const email = (googleUser.email || '').trim().toLowerCase();
    const name = googleUser.name || googleUser.given_name || 'Google User';

    if (!email) {
      return NextResponse.redirect(new URL('/?error=email_not_provided', requestUrl.origin));
    }

    // 1. Strict domain check: Must be @akirapahomecareus.com
    if (!isCompanyDomainEmail(email)) {
      console.warn(`[OAUTH_DENIED] Google OAuth login attempt from non-company domain: ${email}`);
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(`Only @${OFFICIAL_DOMAIN} accounts can access this system`)}`, requestUrl.origin));
    }

    // Look up user record
    let user = await prisma.user.findUnique({
      where: { email },
    });

    let isNewUser = false;
    if (!user) {
      // Check if email is in official Admin allowlist
      if (isAdminEmailAllowed(email)) {
        isNewUser = true;
        user = await prisma.user.create({
          data: {
            email,
            name,
            passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
            role: 'ADMIN',
            phoneNumber: '+16045550199',
          },
        });
      } else {
        // Staff/caregiver accounts must be pre-created by an Admin
        console.warn(`[OAUTH_DENIED] Unregistered company email attempted Google OAuth: ${email}`);
        return NextResponse.redirect(new URL('/?error=account_not_precreated', requestUrl.origin));
      }
    }

    // Admin access via Google is restricted to explicitly authorized emails
    if (user.role === 'ADMIN' && !isAdminEmailAllowed(email)) {
      await logAudit({
        userId: user.id,
        action: 'ADMIN_LOGIN_DENIED',
        details: `Blocked Google OAuth admin login for unauthorized email: ${email}`,
        outcome: 'FAILURE',
      });
      return NextResponse.redirect(new URL('/?error=admin_not_authorized', requestUrl.origin));
    }

    // Log OAuth login success auditing
    await logAudit({
      userId: user.id,
      action: isNewUser ? 'OAUTH_REGISTRATION_SUCCESS' : 'OAUTH_LOGIN_SUCCESS',
      details: `Google Authenticated user: ${email} as ${user.role}`,
      outcome: 'SUCCESS',
    });

    // Construct Response & Redirect
    const response = NextResponse.redirect(new URL('/', requestUrl.origin));

    // Set signed, httpOnly session cookie
    const session = createSessionCookie(user.id);
    response.cookies.set(session.name, session.value, sessionCookieOptions(session.maxAge));

    return response;

  } catch (err) {
    console.error('Google OAuth callback handler execution error:', err);
    return NextResponse.redirect(new URL('/?error=oauth_internal_error', requestUrl.origin));
  }
}
