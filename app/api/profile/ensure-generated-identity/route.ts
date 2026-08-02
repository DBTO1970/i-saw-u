import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { ensureGeneratedProfileIdentity } from '../../../../lib/profile-identity';

export async function POST() {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ success: false, error: 'User is not authenticated.' }, { status: 401 });
  }

  try {
    const profile = await ensureGeneratedProfileIdentity(supabase, user);
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to ensure generated profile identity.';
    console.error('ensure-generated-identity error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
