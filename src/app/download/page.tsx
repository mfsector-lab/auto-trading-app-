'use client';

import Nav from '@/components/Nav';
import Link from 'next/link';
import { AlertTriangle, Check, Copy, Download, ExternalLink } from 'lucide-react';
import { useState } from 'react';

const PROD_URL = 'https://tradeautomate-ai.vercel.app';

const features = [
  ['Pre-Configured Bridge', 'Production API endpoint hardcoded — no manual URL configuration needed'],
  ['Signal & Scalp Mode', 'AI-verified market BUY/SELL/HOLD and rapid scalping execution'],
  ['Order Types', 'Market, Buy Limit, and Sell Limit directly from the web dashboard'],
  ['Risk Controls', 'Magic numbers, spread guard, max daily loss, and dynamic trailing stop'],
  ['AI Self-Learning', 'EAs report closed trade PnL, pips, and durations for auto-optimization'],
  ['Connection Telemetry', 'Live terminal status, open trades snapshot, and instant error logs'],
];

export default function DownloadPage() {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(PROD_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
                Official Release
              </span>
              <h1 className="text-2xl font-bold mt-1 text-gray-900">Download TradeAutomate AI &amp; Bridge EA</h1>
              <p className="mt-1 text-xs text-gray-500 max-w-xl">
                Ready-to-run Expert Advisors with built-in cloud telemetry, desktop bundles, and setup guides.
              </p>
            </div>
            <Link
              href="/bridge"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-700 shadow-sm"
            >
              Interactive Bridge Guide <ExternalLink size={14} />
            </Link>
          </div>
        </section>

        {/* Pre-configured EA Banner */}
        <section className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-gray-900">Seamless &ldquo;Download &amp; Play&rdquo; EAs</h2>
              </div>
              <p className="mt-1 text-xs text-gray-600 max-w-2xl">
                The MetaTrader EA files below have our live production endpoint (<code className="bg-white/80 px-1 py-0.5 rounded border border-gray-200 font-mono text-[11px]">{PROD_URL}/api/signals</code>) hardcoded. You do not need to paste any URL into the EA inputs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/TradeAutomate-EA.mq4"
                download="TradeAutomate_Bridge.mq4"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
              >
                <Download size={14} /> Download MT4 EA (.mq4)
              </a>
              <a
                href="/TradeAutomate-EA.mq5"
                download="TradeAutomate_Bridge.mq5"
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-700 shadow-sm"
              >
                <Download size={14} /> Download MT5 EA (.mq5)
              </a>
            </div>
          </div>
        </section>

        {/* ⚠️ Whitelist Domain Reminder */}
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">
                Action Required: Whitelist Production URL in MetaTrader
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                Even with the URL pre-programmed, MetaTrader security blocks HTTP requests by default until you permit the domain:
              </p>
              <div className="mt-2 p-2.5 bg-white/90 border border-amber-200 rounded-lg text-xs font-mono text-gray-800">
                1. In MetaTrader, go to: <span className="font-bold text-violet-700">Tools &gt; Options &gt; Expert Advisors</span><br />
                2. Check <span className="font-semibold">&ldquo;Allow WebRequest for listed URL&rdquo;</span><br />
                3. Click &ldquo;Add new URL&rdquo; and paste: <span className="font-bold text-blue-700">{PROD_URL}</span>
              </div>
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={copyUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 shadow-xs"
                >
                  <Copy size={13} /> {copied ? 'Copied URL!' : 'Copy Whitelist URL'}
                </button>
                <span className="text-[11px] text-amber-700 font-mono">{PROD_URL}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Other Platform Packages */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            ['Windows Full App', 'Includes ready-to-run EAs, desktop bridge script, and config', 'windows', true],
            ['Desktop App Bundle', 'Native desktop app wrapper with Electron runtime', 'desktop', false],
            ['Full Stack Bundle', 'Complete source repository including Next.js web application and bridge', 'full', false],
          ].map(([name, text, type, primary]) => (
            <div key={String(name)} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{String(name)}</p>
                <p className="mt-1 text-xs text-gray-500 leading-relaxed">{String(text)}</p>
              </div>
              <a
                href={`/api/download-package?type=${type}`}
                className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-xs ${
                  primary
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                <Download size={13} /> Download {String(name)}
              </a>
            </div>
          ))}
        </section>

        {/* Feature Grid */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900">EA Feature Grid &amp; Automation Specs</h3>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {features.map(([title, desc]) => (
              <div key={title} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                <p className="font-bold text-gray-900">{title}</p>
                <p className="mt-1 text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
