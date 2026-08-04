import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabasePublicKey, getSupabaseServiceRoleKey, getSupabaseUrl } from '../../../lib/supabase/config';

export const runtime = 'nodejs';

function normalizeBucketId(bucketAlias: string | undefined) {
  if (bucketAlias === 'show-photos') {
    return 'user-photos';
  }

  return bucketAlias || '';
}

function buildStoragePath(pathSegments: string[]) {
  const [bucketAlias, ...restSegments] = pathSegments;
  const bucketId = normalizeBucketId(bucketAlias);
  const objectPath = restSegments.filter(Boolean).join('/');

  if (!bucketId || !objectPath) {
    return null;
  }

  return { bucketId, objectPath };
}

function getRequestCookieStore() {
  const cookieStore = cookies();

  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Route handlers can read cookies even when response mutation isn't allowed.
      }
    },
  };
}

function createSessionClient() {
  return createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: getRequestCookieStore(),
    },
  );
}

async function proxyWithServiceRole(upstreamPath: string, search: string, request: NextRequest) {
  const supabaseUrl = getSupabaseUrl().replace(/\/+$/, '');
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!serviceRoleKey) {
    return null;
  }

  const upstreamHeaders = new Headers();
  const accept = request.headers.get('accept');
  const range = request.headers.get('range');
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  if (accept) upstreamHeaders.set('accept', accept);
  if (range) upstreamHeaders.set('range', range);
  if (ifNoneMatch) upstreamHeaders.set('if-none-match', ifNoneMatch);
  if (ifModifiedSince) upstreamHeaders.set('if-modified-since', ifModifiedSince);
  upstreamHeaders.set('authorization', `Bearer ${serviceRoleKey}`);
  upstreamHeaders.set('apikey', serviceRoleKey);

  const upstreamResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/user-photos/${upstreamPath}${search}`,
    {
      method: request.method,
      headers: upstreamHeaders,
      cache: 'no-store',
    }
  );

  return upstreamResponse;
}

async function proxyStorageRequest(request: NextRequest, pathSegments: string[]) {
  const path = buildStoragePath(pathSegments);
  if (!path) {
    return NextResponse.json({ error: 'Invalid storage path.' }, { status: 400 });
  }

  const search = request.nextUrl.search;
  const serviceRoleResponse = await proxyWithServiceRole(path.objectPath, search, request);

  if (serviceRoleResponse) {
    if (serviceRoleResponse.ok) {
      const responseHeaders = new Headers();
      ['content-type', 'cache-control', 'etag', 'last-modified', 'accept-ranges', 'content-range'].forEach((headerName) => {
        const headerValue = serviceRoleResponse.headers.get(headerName);
        if (headerValue) {
          responseHeaders.set(headerName, headerValue);
        }
      });

      return new NextResponse(serviceRoleResponse.body, {
        status: serviceRoleResponse.status,
        headers: responseHeaders,
      });
    }
  }

  const sessionClient = createSessionClient();
  const { data, error } = await sessionClient.storage.from(path.bucketId).download(path.objectPath);

  if (error || !data) {
    return NextResponse.json(
      {
        error: error?.message || 'Unable to load storage object.',
        bucketId: path.bucketId,
        path: path.objectPath,
      },
      { status: 400 }
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set('content-type', data.type || 'image/webp');
  responseHeaders.set('cache-control', 'public, max-age=31536000, immutable');

  const body = await data.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyStorageRequest(request, context.params.path || []);
}

export async function HEAD(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxyStorageRequest(request, context.params.path || []);
}
