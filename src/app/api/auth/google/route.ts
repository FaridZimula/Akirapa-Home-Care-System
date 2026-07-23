import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const requestUrl = new URL(request.url);
  // Derive from the actual request origin so this works unchanged on localhost,
  // Vercel preview URLs, and production - as long as each origin's callback URL
  // is registered in the Google Cloud Console OAuth client.
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${requestUrl.origin}/api/auth/google/callback`;

  if (!clientId) {
    // Falls back to standard landing page with error parameter
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
