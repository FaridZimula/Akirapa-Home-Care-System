import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { createSessionCookie, sessionCookieOptions } from '@/lib/session';
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
    const email = googleUser.email;
    const name = googleUser.name || googleUser.given_name || 'Google User';

    if (!email) {
      return NextResponse.redirect(new URL('/?error=email_not_provided', requestUrl.origin));
    }

    // Look up or create user record
    let user = await prisma.user.findUnique({
      where: { email },
    });

    let isNewUser = false;
    if (!user) {
      isNewUser = true;

      // OAuth sign-ups are always provisioned as FAMILY_MEMBER. Elevated roles
      // (ADMIN, CARE_COORDINATOR, CAREGIVER) must be granted directly in the
      // database - they can never be self-assigned via a public sign-up flow.
      user = await prisma.user.create({
        data: {
          email,
          name,
          // Google OAuth users authenticate via Google only; this hash is never used for password login.
          passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
          role: 'FAMILY_MEMBER',
          phoneNumber: '+16045550199',
        },
      });

      // Seeding helper: If new Family Member registers, link them to the first existing client recipient
      if (user.role === 'FAMILY_MEMBER') {
        const client = await prisma.client.findFirst();
        if (client) {
          await prisma.linkedFamilyMember.create({
            data: {
              clientId: client.id,
              userId: user.id,
            },
          }).catch(() => {});
        }
      }
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
