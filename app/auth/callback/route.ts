import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const next = nextParam && /^\/(?!\/)/.test(nextParam) ? nextParam : '/';
  const oauthError = searchParams.get('error_description') || searchParams.get('error');

  if (oauthError) {
    console.error('Supabase OAuth Error:', oauthError);
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(oauthError)}`);
  }

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } else {
      console.error('Supabase Exchange Code Error:', error.message);
      return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error.message)}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=No+authentication+code+provided`);
}
