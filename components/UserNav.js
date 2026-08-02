'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../lib/supabase/client';
import Link from 'next/link';
import AccountCleanupControls from './AccountCleanupControls';

const TERMS_VERSION = '2026-08-02';

export default function UserNav() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isAcceptingTerms, setIsAcceptingTerms] = useState(false);
  const [termsError, setTermsError] = useState('');

  const supabase = createClient();

  const resolveAppOrigin = () => {
    const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
    if (configured) {
      return configured.replace(/\/+$/, '');
    }
    return window.location.origin;
  };

  useEffect(() => {
    async function loadUserAndProfile(sessionUser = null) {
      const nextUser = sessionUser || (await supabase.auth.getUser()).data?.user || null;
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setProfileLoaded(true);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', nextUser.id)
        .single();
      setProfile(data || null);
      setProfileLoaded(true);
      setLoading(false);
    }

    loadUserAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadUserAndProfile(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleOAuthLogin = async (provider) => {
    const redirectTo = `${resolveAppOrigin()}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    });

    if (error) {
      const message = `OAuth (${provider}) failed: ${error.message}`;
      console.error(message, { redirectTo });
      alert(message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsOpen(false);
    setIsAccountMenuOpen(false);
    window.location.reload();
  };

  const handleAcceptTerms = async () => {
    if (!user) {
      return;
    }

    setIsAcceptingTerms(true);
    setTermsError('');
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('profiles')
      .update({
        terms_accepted_at: nowIso,
        terms_accepted_version: TERMS_VERSION,
        updated_at: nowIso,
      })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      setTermsError(error.message || 'Unable to save Terms acceptance right now.');
      setIsAcceptingTerms(false);
      return;
    }

    setProfile(data || null);
    setIsAcceptingTerms(false);
  };

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-xl bg-slate-800/80" />;
  }

  if (!user) {
    return (
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-300 transition-all hover:border-cyan-400 hover:bg-cyan-500/20 sm:text-sm"
        >
          Sign In
        </button>

        {/* OAuth Modal */}
        {isOpen && (
          <div className="fixed inset-0 max-h-[calc(100vh-2rem)] z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/50 sm:p-8">
              <button
                onClick={() => setIsOpen(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-white"
              >
                ✕
              </button>

              <div className="mb-6 space-y-2 text-center">
                <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Welcome to i-saw-u</span>
                <h2 className="text-2xl font-bold text-white">Sign In to Your Account</h2>
                <p className="text-xs text-slate-400">Save photos, EXIF data, and show memories to your personal library.</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleOAuthLogin('google')}
                  className="flex w-full items-center justify-center space-x-3 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700/80 hover:border-slate-600"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <button
                  onClick={() => handleOAuthLogin('github')}
                  className="flex w-full items-center justify-center space-x-3 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-slate-700/80 hover:border-slate-600"
                >
                  <svg className="h-5 w-5 fill-current text-white" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span>Continue with GitHub</span>
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    );
  }

  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url;
  const username = profile?.username || user.user_metadata?.full_name || user.email;
  const hasAcceptedTerms = Boolean(profile?.terms_accepted_at) && profile?.terms_accepted_version === TERMS_VERSION;
  const mustAcceptTerms = Boolean(user && profileLoaded && !hasAcceptedTerms);

  return (
    <div className="flex items-center space-x-3">
      <Link
        href="/library"
        className="flex items-center space-x-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-all hover:border-cyan-500/50 hover:bg-slate-800 hover:text-cyan-300 sm:text-sm"
      >
        <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span>My Library</span>
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsAccountMenuOpen((value) => !value)}
          className="flex max-w-[220px] items-center space-x-2 rounded-full border border-slate-800 bg-slate-900/90 p-1 pl-3"
        >
          <span className="max-w-[110px] truncate text-xs font-medium text-slate-300 sm:max-w-[160px]">
            {username}
          </span>

          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">
              {username ? username.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
        </button>

        {isAccountMenuOpen ? (
          <div className="absolute right-0 z-40 mt-2 w-[min(60vw,20rem)] rounded-2xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl shadow-black/50 sm:w-80">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <p className="text-sm font-semibold text-white">Account</p>
                <p className="text-xs text-slate-400">{username}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-red-500/40 hover:text-red-300"
              >
                Sign out
              </button>
            </div>

            <AccountCleanupControls />
          </div>
        ) : null}
      </div>
      {mustAcceptTerms ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Terms of Use Agreement</p>
              <p className="mt-1 text-xs text-slate-400">Last Updated: August 2, 2026</p>
            </div>
            <div className="max-h-[62vh] space-y-3 overflow-y-auto px-5 py-4 text-sm text-slate-200">
              <p>Welcome to <strong>I Saw U</strong> (“Company,” “we,” “us,” or “our”). These Terms of Use (“Terms”) govern your access to and use of our website, mobile application, and related services (collectively, the “Service”).</p>
              <p>By creating an account, accessing, or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>
              <p><strong>1. Age Eligibility and Account Registration</strong></p>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                <li><strong>Strict Age Requirement:</strong> You must be at least <strong>18 years of age</strong> to register for, access, or use the Service. By accessing or using I Saw U, you represent and warrant that you are at least 18 years old.</li>
                <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.</li>
                <li><strong>Accurate Information:</strong> You agree to provide accurate, current, and complete information during registration and to keep your account details updated.</li>
              </ul>
              <p><strong>2. Entertainment Purposes Only</strong></p>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                <li><strong>Entertainment Disclaimer:</strong> <strong>I Saw U is provided solely and exclusively for entertainment purposes.</strong> The Service, including any photo processing, location/EXIF metadata displaying, setlist/event matching, or venue logs, is intended strictly for personal enjoyment.</li>
                <li><strong>No Reliance:</strong> Information provided through the Service should not be relied upon for legal, navigation, identification, security, or official record-keeping purposes.</li>
              </ul>
              <p><strong>3. User Content and Media Permissions</strong></p>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                <li><strong>Ownership:</strong> You retain full ownership of all photos, media, EXIF metadata, text, and other materials you upload or capture through the Service (“User Content”).</li>
                <li><strong>License Grant:</strong> By uploading User Content, you grant us a non-exclusive, worldwide, royalty-free license to host, store, display, reformat, and process your content solely for the purpose of operating, improving, and providing the Service to you.</li>
                <li><strong>Metadata Processing:</strong> You acknowledge and agree that the Service may extract and process EXIF metadata embedded in your media (including timestamps, device specs, and location coordinates) to organize and present content within your account.</li>
              </ul>
              <p><strong>4. Acceptable Use Policy</strong> You agree <strong>not</strong> to engage in any of the following prohibited activities:</p>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                <li><strong>Illegal Content &amp; Harassment:</strong> Uploading or transmitting material that is unlawful, harassing, infringing, libelous, or harmful.</li>
                <li><strong>Infringement:</strong> Uploading media or content that violates the intellectual property, trademark, or privacy rights of third parties.</li>
                <li><strong>Service Disruption:</strong> Attempting to reverse engineer, bypass security controls, introduce malware, or overwhelm our infrastructure with unauthorized automated requests.</li>
                <li><strong>Misuse of Live Capture:</strong> Using offline queuing or automated capture tools to harvest unauthorized visual or location data from public or private venues or individuals without consent.</li>
              </ul>
              <p><strong>5. Intellectual Property Rights</strong><br />All software, designs, layout, graphics, code, and trademarks associated with <strong>I Saw U</strong> (excluding your personal User Content) are the exclusive property of the Company and its licensors. You may not copy, modify, or distribute any part of the Service without prior written authorization.</p>
              <p><strong>6. Account Termination and Suspension</strong><br />We reserve the right to suspend or terminate your access to the Service at our sole discretion, without prior notice, if you violate these Terms, if we suspect you are under 18 years of age, or if necessary to protect the security and integrity of our systems. You may terminate your account at any time within the app settings or by contacting support.</p>
              <p><strong>7. Disclaimers and Limitation of Liability</strong></p>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                <li><strong>"As-Is" Service:</strong> The Service is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, express or implied.</li>
                <li><strong>Data &amp; Upload Loss:</strong> While we employ offline synchronization and retry queues to manage media uploads, we are not liable for lost photos, failed uploads, missing EXIF data, or server outages. You are encouraged to maintain local backups of your media.</li>
                <li><strong>Limitation of Liability:</strong> To the maximum extent permitted by law, I Saw U shall not be liable for any indirect, incidental, consequential, or punitive damages arising out of your use of or inability to use the Service.</li>
              </ul>
              <p><strong>8. Governing Law and Jurisdiction</strong><br />These Terms shall be governed by and construed in accordance with the laws of the State of <strong>Maryland</strong>, without regard to its conflict of law principles. Any legal action or proceeding arising under these Terms shall be brought exclusively in the state or federal courts located within <strong>Prince George's County, Maryland</strong>.</p>
              <p><strong>9. Contact Information</strong><br />If you have any questions, concerns, issues, or inquiries regarding these Terms or the Service, please submit an issue or open a discussion directly on our official GitHub repository:</p>
              <p><a href="https://github.com/DBTO1970/i-saw-u" target="_blank" rel="noreferrer" className="text-cyan-300 underline">https://github.com/DBTO1970/i-saw-u</a></p>
              {termsError ? (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{termsError}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isAcceptingTerms}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
              >
                Sign out
              </button>
              <button
                type="button"
                onClick={handleAcceptTerms}
                disabled={isAcceptingTerms}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
              >
                {isAcceptingTerms ? 'Saving...' : 'I Agree'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
