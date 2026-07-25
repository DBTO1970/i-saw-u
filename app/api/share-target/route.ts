import { NextResponse } from 'next/server';
import { parseExifFromArrayBuffer } from '../../../lib/exif-metadata';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const wantsJson = requestUrl.searchParams.get('format') === 'json'
      || request.headers.get('accept')?.includes('application/json');
    const formData = await request.formData();
    const sharedFile = formData.get('files');

    if (!(sharedFile instanceof File)) {
      if (wantsJson) {
        return NextResponse.json(
          { error: 'No shared photo file was found in the request payload.' },
          { status: 400 },
        );
      }

      const failedRedirect = NextResponse.redirect(new URL('/?share_error=missing_file', request.url), 303);
      return failedRedirect;
    }

    const buffer = await sharedFile.arrayBuffer();
    const metadata = await parseExifFromArrayBuffer(buffer);
    const payload = {
      fileName: sharedFile.name,
      fileType: sharedFile.type,
      fileSize: sharedFile.size,
      metadata,
      receivedAt: new Date().toISOString(),
    };

    if (wantsJson) {
      return NextResponse.json(payload);
    }

    const redirectResponse = NextResponse.redirect(new URL('/?shared_photo=1', request.url), 303);
    redirectResponse.cookies.set('sharedPhotoPayload', encodeURIComponent(JSON.stringify(payload)), {
      path: '/',
      maxAge: 120,
      sameSite: 'lax',
      httpOnly: false,
    });
    return redirectResponse;
  } catch (error) {
    console.error('Failed to process share-target upload:', error);
    const requestUrl = new URL(request.url);
    const wantsJson = requestUrl.searchParams.get('format') === 'json'
      || request.headers.get('accept')?.includes('application/json');
    if (wantsJson) {
      return NextResponse.json(
        { error: 'Unable to process shared photo metadata.' },
        { status: 500 },
      );
    }

    return NextResponse.redirect(new URL('/?share_error=parse_failed', request.url), 303);
  }
}
