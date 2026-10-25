import Nav from '@/components/Nav';

const features = [
  ['Signal Mode', 'AI-verified market BUY/SELL/HOLD commands'],
  ['Scalp Mode', 'Fast entries with spread guard and custom TP/SL'],
  ['Order Types', 'Market, Buy Limit, and Sell Limit from the app'],
  ['Risk Controls', 'Magic numbers, max spread, and trailing stop'],
  ['Operations', 'Manual emergency stop and trade close actions'],
  ['Connection', 'Terminal status, trade history, and error logs'],
];
export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 text-gray-900">
          <h1 className="text-xl font-bold">Download Dark Venus Auto Bot</h1>
          <p className="mt-1 text-xs text-gray-500">Platform packages, EA file, setup guide, and broker-connection bootstrap.</p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            ['Windows', 'Recommended for MT4/MT5 terminals', true],
            ['Desktop App', 'Native desktop app wrapper (Electron installer source)', false],
            ['Site Source', 'Full website + bridge source code package', false],
            ['Full Stack', 'Complete project for Windows and web deployment', false],
            ['iOS', 'Install on iPhone as a home screen app', false],
          ].map(([name, text, primary]) => (
            <div key={String(name)} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-semibold text-gray-900">{String(name)}</p>
              <p className="mt-1 text-xs text-gray-500">{String(text)}</p>
              <a
                href={`/api/download-package?type=${String(name) === 'Site Source' ? 'site' : String(name) === 'Full Stack' ? 'full' : String(name) === 'Desktop App' ? 'desktop' : String(name).toLowerCase()}`}
                className={`mt-3 inline-flex rounded-lg px-3 py-2 text-xs font-semibold ${primary ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Download package
              </a>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Full App Downloads</p>
          <p className="mt-1 text-xs text-gray-500">Download complete builds for other computers (website + bridge + EA).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/download-package?type=windows" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Download Windows Full App</a>
            <a href="/api/download-package?type=desktop" className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black">Download Desktop App Bundle</a>
            <a href="/api/download-package?type=site" className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black">Download Site Source</a>
            <a href="/api/download-package?type=full" className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">Download Full Stack Bundle</a>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Install on iPhone (iOS)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-gray-600">
            <li>Open your public TradeAutomate URL in Safari.</li>
            <li>Tap the Share button.</li>
            <li>Select Add to Home Screen.</li>
            <li>Tap Add to install it like an app.</li>
            <li>Launch from your iPhone home screen.</li>
          </ol>
          <a
            href="/api/download-package?type=ios"
            className="mt-3 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Download iOS package
          </a>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">MT4 / MT5 Setup (5 Steps)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-gray-600">
            <li>Download TradeAutomate-EA.mq4 or TradeAutomate-EA.mq5 from below.</li>
            <li>Move it into MQL4/Experts or MQL5/Experts and compile in MetaEditor.</li>
            <li>Enable WebRequest and add your app URL.</li>
            <li>Set AuthToken, lot, slippage, and polling values.</li>
            <li>Attach EA to chart and allow live trading.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/TradeAutomate-EA.mq4" download className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Download .mq4 file</a>
            <a href="/TradeAutomate-EA.mq5" download className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Download .mq5 file</a>
            <code className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700">curl -L /api/download-package?type=windows -o tradeautomate.zip</code>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">EA Feature Grid</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {features.map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="font-semibold text-gray-800">{title}</p>
                <p className="mt-1 text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
