import { NextResponse } from 'next/server';
import { savePhotoToLibrary } from '../../../actions/user-library';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const result = await savePhotoToLibrary(formData);

    if (!result || typeof result !== 'object' || typeof result.success !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Save did not complete correctly. Please try again.' },
        { status: 500 },
      );
    }

    const status = result.success ? 200 : result.errorCode === 'duplicate_photo' ? 409 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save photo.' },
      { status: 500 },
    );
  }
}
