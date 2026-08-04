import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

function getSupabaseServiceRoleKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function buildUpstreamUrl(pathSegments: string[], search: string) {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    return null;
  }

  const cleanedBaseUrl = supabaseUrl.replace(/\/+$/, '');
  const [bucketAlias, ...restSegments] = pathSegments;
  const bucketId = bucketAlias === 'show-photos' ? 'user-photos' : bucketAlias;
  const normalizedPath = restSegments
    .filter((segment) => typeof segment === 'string' && segment.trim())
    .map((segment) => encodeURIComponent(segment.trim()))
    .join('/');

  if (!bucketId || !normalizedPath) {
    return null;
  }

  return `${cleanedBaseUrl}/storage/v1/object/${encodeURIComponent(bucketId)}/${normalizedPath}${search}`;
}

async function proxyStorageRequest(request: NextRequest, pathSegments: string[]) {
  const upstreamUrl = buildUpstreamUrl(pathSegments, request.nextUrl.search);
  if (!upstreamUrl) {
    return NextResponse.json(
      { error: 'Supabase storage proxy is not configured for this environment.' },
      { status: 500 }
    );
  }

  const upstreamHeaders = new Headers();
  const accept = request.headers.get('accept');
  const range = request.headers.get('range');
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (accept) upstreamHeaders.set('accept', accept);
  if (range) upstreamHeaders.set('range', range);
  if (ifNoneMatch) upstreamHeaders.set('if-none-match', ifNoneMatch);
  if (ifModifiedSince) upstreamHeaders.set('if-modified-since', ifModifiedSince);
  if (serviceRoleKey) {
    upstreamHeaders.set('authorization', `Bearer ${serviceRoleKey}`);
    upstreamHeaders.set('apikey', serviceRoleKey);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: upstreamHeaders,
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  ['content-type', 'cache-control', 'etag', 'last-modified', 'accept-ranges', 'content-range'].forEach((headerName) => {
    const headerValue = upstreamResponse.headers.get(headerName);
    if (headerValue) {
      responseHeaders.set(headerName, headerValue);
    }
  });

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyStorageRequest(request, context.params.path || []);
}

export async function HEAD(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyStorageRequest(request, context.params.path || []);
}
