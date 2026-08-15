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
    console.error('Google OAuth redirect error:', error);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, requestUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_auth_code', requestUrl.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${requestUrl.origin}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    console.error('Google OAuth credentials not configured');
    return NextResponse.redirect(new URL('/?error=google_not_configured', requestUrl.origin));
  }

  try {
    // Exchange Auth Code for Tokens
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
      console.error('Failed to exchange Google OAuth code:', errBody);
      let reason = 'token_exchange_failed';
      try {
        const googleError = JSON.parse(errBody)?.error;
        if (typeof googleError === 'string' && googleError) {
          reason = `token_exchange_failed_${googleError}`;
        }
      } catch { /* non-JSON body */ }
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(reason)}`, requestUrl.origin));
    }

    const { access_token } = await tokenRes.json();

    // Fetch User Profile from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      console.error('Failed to fetch Google user profile');
      return NextResponse.redirect(new URL('/?error=profile_fetch_failed', requestUrl.origin));
    }

    const googleUser = await userRes.json();
    const email = (googleUser.email || '').trim().toLowerCase();
    const name = googleUser.name || googleUser.given_name || 'Google User';

    if (!email) {
      return NextResponse.redirect(new URL('/?error=email_not_provided', requestUrl.origin));
    }

    // Look up the user in the database by their Google email
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // If the email is an authorized admin company email, auto-create the admin account
      if (isCompanyDomainEmail(email) && isAdminEmailAllowed(email)) {
        user = await prisma.user.create({
          data: {
            email,
            name,
            passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
            role: 'ADMIN',
            phoneNumber: null,
          },
        });
        console.log(`[OAUTH] Auto-created admin account for: ${email}`);
      } else {
        // User doesn't exist in the system — they need to be registered first
        console.warn(`[OAUTH_DENIED] No account found for Google email: ${email}`);
        return NextResponse.redirect(
          new URL(`/?error=${encodeURIComponent('No account found for this Google email. Please contact your administrator.')}`, requestUrl.origin)
        );
      }
    }

    // Additional check: ADMIN role must be in the company allowlist
    if (user.role === 'ADMIN' && !isAdminEmailAllowed(email)) {
      await logAudit({
        userId: user.id,
        action: 'ADMIN_LOGIN_DENIED',
        details: `Blocked Google OAuth admin login for unauthorized email: ${email}`,
        outcome: 'FAILURE',
      });
      return NextResponse.redirect(new URL('/?error=admin_not_authorized', requestUrl.origin));
    }

    // Log success
    logAudit({
      userId: user.id,
      action: 'OAUTH_LOGIN_SUCCESS',
      details: `Google OAuth login: ${email} as ${user.role}`,
      outcome: 'SUCCESS',
    }).catch(console.error);

    // Create session and redirect to dashboard
    const response = NextResponse.redirect(new URL('/', requestUrl.origin));
    const session = createSessionCookie(user.id);
    response.cookies.set(session.name, session.value, sessionCookieOptions(session.maxAge));

    return response;

  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return NextResponse.redirect(new URL('/?error=oauth_internal_error', requestUrl.origin));
  }
}
