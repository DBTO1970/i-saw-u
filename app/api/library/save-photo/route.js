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

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save photo.' },
      { status: 500 },
    );
  }
}
