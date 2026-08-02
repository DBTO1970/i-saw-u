import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userAgent = request.headers.get('user-agent') || null;

    if (!body || typeof body !== 'object' || typeof body.event !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid diagnostics payload.' }, { status: 400 });
    }

    const payload = {
      source: typeof body.source === 'string' ? body.source : 'unknown',
      event: body.event,
      severity: typeof body.severity === 'string' ? body.severity : 'error',
      details: body.details && typeof body.details === 'object' ? body.details : {},
      error: body.error && typeof body.error === 'object' ? body.error : null,
      clientTimestamp: typeof body.timestamp === 'string' ? body.timestamp : null,
      serverTimestamp: new Date().toISOString(),
      userAgent,
    };

    // This surfaces browser-side failures in Vercel server logs.
    console.error('[CLIENT_DIAGNOSTIC]', payload);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CLIENT_DIAGNOSTIC_ROUTE_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to record diagnostics.' }, { status: 500 });
  }
}
