import Nav from '@/components/Nav';

const sections = [
  ['1. Data Collection', 'We collect account preferences, command history, and operational telemetry.'],
  ['2. Trading Data', 'Signals, logs, and execution metadata are stored to provide analytics and traceability.'],
  ['3. Security', 'Traffic is expected to use HTTPS and token-authenticated API requests.'],
  ['4. Cookies & Storage', 'Local storage may be used for user interface state and cached preferences.'],
  ['5. Third-Party Services', 'Hosting providers and analytics tools may process technical metadata.'],
  ['6. Retention', 'Operational logs are retained only as long as required for diagnostics and compliance.'],
  ['7. User Controls', 'Users can request data export or deletion for non-regulatory records.'],
  ['8. Contact', 'For privacy questions, contact your administrator or service owner.'],
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-6 space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 text-gray-900">
          <h1 className="text-xl font-bold">Privacy Policy</h1>
          <p className="mt-1 text-xs text-gray-500">Dark Venus Auto Bot privacy and data handling policy.</p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          {sections.map(([title, body]) => (
            <div key={title}>
              <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
              <p className="mt-1 text-xs text-gray-600">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
