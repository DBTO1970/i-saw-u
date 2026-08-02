import TermsBackButton from './TermsBackButton';

export const metadata = {
  title: 'Terms of Use | i-saw-u',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_60%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:rounded-3xl sm:p-6 md:p-10">
        <TermsBackButton />
        <h1 className="text-2xl font-bold text-white">TERMS OF USE AGREEMENT</h1>
        <p className="mt-2 text-sm text-slate-300"><strong>Last Updated:</strong> August 2, 2026</p>

        <div className="mt-6 space-y-4 text-sm text-slate-200">
          <p>Welcome to <strong>I Saw U</strong> (“Company,” “we,” “us,” or “our”). These Terms of Use (“Terms”) govern your access to and use of our website, mobile application, and related services (collectively, the “Service”).</p>
          <p>By creating an account, accessing, or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>

          <h2 className="text-base font-semibold text-cyan-300">1. Age Eligibility and Account Registration</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            <li><strong>Strict Age Requirement:</strong> You must be at least <strong>18 years of age</strong> to register for, access, or use the Service. By accessing or using I Saw U, you represent and warrant that you are at least 18 years old.</li>
            <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.</li>
            <li><strong>Accurate Information:</strong> You agree to provide accurate, current, and complete information during registration and to keep your account details updated.</li>
          </ul>

          <h2 className="text-base font-semibold text-cyan-300">2. Entertainment Purposes Only</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            <li><strong>Entertainment Disclaimer:</strong> <strong>I Saw U is provided solely and exclusively for entertainment purposes.</strong> The Service, including any photo processing, location/EXIF metadata displaying, setlist/event matching, or venue logs, is intended strictly for personal enjoyment.</li>
            <li><strong>No Reliance:</strong> Information provided through the Service should not be relied upon for legal, navigation, identification, security, or official record-keeping purposes.</li>
          </ul>

          <h2 className="text-base font-semibold text-cyan-300">3. User Content and Media Permissions</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            <li><strong>Ownership:</strong> You retain full ownership of all photos, media, EXIF metadata, text, and other materials you upload or capture through the Service (“User Content”).</li>
            <li><strong>License Grant:</strong> By uploading User Content, you grant us a non-exclusive, worldwide, royalty-free license to host, store, display, reformat, and process your content solely for the purpose of operating, improving, and providing the Service to you.</li>
            <li><strong>Metadata Processing:</strong> You acknowledge and agree that the Service may extract and process EXIF metadata embedded in your media (including timestamps, device specs, and location coordinates) to organize and present content within your account.</li>
          </ul>

          <h2 className="text-base font-semibold text-cyan-300">4. Acceptable Use Policy</h2>
          <p>You agree <strong>not</strong> to engage in any of the following prohibited activities:</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            <li><strong>Illegal Content &amp; Harassment:</strong> Uploading or transmitting material that is unlawful, harassing, infringing, libelous, or harmful.</li>
            <li><strong>Infringement:</strong> Uploading media or content that violates the intellectual property, trademark, or privacy rights of third parties.</li>
            <li><strong>Service Disruption:</strong> Attempting to reverse engineer, bypass security controls, introduce malware, or overwhelm our infrastructure with unauthorized automated requests.</li>
            <li><strong>Misuse of Live Capture:</strong> Using offline queuing or automated capture tools to harvest unauthorized visual or location data from public or private venues or individuals without consent.</li>
          </ul>

          <h2 className="text-base font-semibold text-cyan-300">5. Intellectual Property Rights</h2>
          <p>All software, designs, layout, graphics, code, and trademarks associated with <strong>I Saw U</strong> (excluding your personal User Content) are the exclusive property of the Company and its licensors. You may not copy, modify, or distribute any part of the Service without prior written authorization.</p>

          <h2 className="text-base font-semibold text-cyan-300">6. Account Termination and Suspension</h2>
          <p>We reserve the right to suspend or terminate your access to the Service at our sole discretion, without prior notice, if you violate these Terms, if we suspect you are under 18 years of age, or if necessary to protect the security and integrity of our systems. You may terminate your account at any time within the app settings or by contacting support.</p>

          <h2 className="text-base font-semibold text-cyan-300">7. Disclaimers and Limitation of Liability</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            <li><strong>&quot;As-Is&quot; Service:</strong> The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind, express or implied.</li>
            <li><strong>Data &amp; Upload Loss:</strong> While we employ offline synchronization and retry queues to manage media uploads, we are not liable for lost photos, failed uploads, missing EXIF data, or server outages. You are encouraged to maintain local backups of your media.</li>
            <li><strong>Limitation of Liability:</strong> To the maximum extent permitted by law, I Saw U shall not be liable for any indirect, incidental, consequential, or punitive damages arising out of your use of or inability to use the Service.</li>
          </ul>

          <h2 className="text-base font-semibold text-cyan-300">8. Governing Law and Jurisdiction</h2>
          <p>These Terms shall be governed by and construed in accordance with the laws of the State of <strong>Maryland</strong>, without regard to its conflict of law principles. Any legal action or proceeding arising under these Terms shall be brought exclusively in the state or federal courts located within <strong>Prince George&apos;s County, Maryland</strong>.</p>

          <h2 className="text-base font-semibold text-cyan-300">9. Contact Information</h2>
          <p>If you have any questions, concerns, issues, or inquiries regarding these Terms or the Service, please submit an issue or open a discussion directly on our official GitHub repository:</p>
          <p><a href="https://github.com/DBTO1970/i-saw-u" target="_blank" rel="noreferrer" className="text-cyan-300 underline">https://github.com/DBTO1970/i-saw-u</a></p>
        </div>
      </div>
    </main>
  );
}
