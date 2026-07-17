import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

  if (!clientId) {
    // Falls back to standard landing page with error parameter
    const requestUrl = new URL(request.url);
    return NextResponse.redirect(new URL('/?error=google_not_configured', requestUrl.origin));
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&state=google-oauth-state` +
    `&prompt=consent`;

  return NextResponse.redirect(googleAuthUrl);
}
