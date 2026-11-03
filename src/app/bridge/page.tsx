'use client';

import Nav from '@/components/Nav';
import { AlertTriangle, Check, Copy, Download, Link2, Monitor, Server, Zap } from 'lucide-react';
import { useState } from 'react';

const PROD_URL = 'https://tradeautomate-ai.vercel.app';
const API_URL = `${PROD_URL}/api/signals`;

const SETUP_STEPS_MT4 = [
  { step: '1', title: 'Download the EA file', desc: 'Click "Download MT4 EA" below to get TradeAutomate_Bridge.mq4' },
  { step: '2', title: 'Open MetaEditor', desc: 'In MT4, press F4 or go to Tools → MetaQuotes Language Editor' },
  { step: '3', title: 'Place EA in Experts folder', desc: 'Copy TradeAutomate_Bridge.mq4 into your MQL4/Experts directory, then click Compile (F7)' },
  { step: '4', title: 'Allow WebRequest URL', desc: `In MT4: Tools → Options → Expert Advisors → check "Allow WebRequest for listed URL" and add exactly: ${PROD_URL}` },
  { step: '5', title: 'Set your Client ID', desc: 'In EA inputs, set ClientId to the 4-digit PIN shown on your dashboard. All other fields are pre-configured.' },
  { step: '6', title: 'Attach to chart', desc: 'Drag the EA onto any chart. Enable "Allow Algo Trading" and confirm the smiley face is green.' },
];

const SETUP_STEPS_MT5 = [
  { step: '1', title: 'Download the EA file', desc: 'Click "Download MT5 EA" below to get TradeAutomate_Bridge.mq5' },
  { step: '2', title: 'Open MetaEditor', desc: 'In MT5, press F4 or go to Tools → MetaQuotes Language Editor' },
  { step: '3', title: 'Place EA in Experts folder', desc: 'Copy TradeAutomate_Bridge.mq5 into your MQL5/Experts directory, then click Compile (F7)' },
  { step: '4', title: 'Allow WebRequest URL', desc: `In MT5: Tools → Options → Expert Advisors → check "Allow WebRequest for listed URL" and add exactly: ${PROD_URL}` },
  { step: '5', title: 'Set your Client ID', desc: 'In EA inputs, set ClientId to the 4-digit PIN from your dashboard. The API endpoint is already hardcoded.' },
  { step: '6', title: 'Attach to chart', desc: 'Drag the EA onto any EURUSD or XAUUSD chart. Enable "Allow Algo Trading".' },
];

export default function BridgePage() {
  const [copied, setCopied] = useState('');
  const [platform, setPlatform] = useState<'MT4' | 'MT5'>('MT4');

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const steps = platform === 'MT4' ? SETUP_STEPS_MT4 : SETUP_STEPS_MT5;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">

        {/* Header */}
        <section className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/60 to-slate-950 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Link2 size={20} className="text-violet-400" />
            <span className="text-violet-300 text-xs font-semibold uppercase tracking-widest">MT4 / MT5 Bridge</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Download &amp; Play — EA Setup</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Our pre-configured Expert Advisor files have the production API endpoint hardcoded.
            Just download, compile, set your Client ID (PIN), and start trading — no URL copy-pasting required.
          </p>

          {/* Pre-configured notice */}
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
            <Check size={16} className="text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-300">API endpoint pre-configured</p>
              <p className="text-xs text-green-400/80 mt-0.5">
                Both EA files already point to <code className="bg-green-900/40 px-1 rounded">{API_URL}</code> — no manual input needed.
              </p>
            </div>
          </div>
        </section>

        {/* ⚠️ Allowed URL reminder */}
        <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-300">Required: Add domain to MetaTrader&apos;s Allowed URLs list</p>
              <p className="text-xs text-amber-400/80 mt-1">
                Even though the URL is baked into the EA, MetaTrader still requires you to whitelist it manually under:
              </p>
              <div className="mt-2 rounded-lg bg-amber-900/30 border border-amber-400/20 px-3 py-2 font-mono text-xs text-amber-200">
                Tools → Options → Expert Advisors → Allow WebRequest for listed URL
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-lg border border-amber-500/30 bg-amber-900/40 px-3 py-1.5 text-sm font-bold text-amber-200 font-mono">
                  {PROD_URL}
                </code>
                <button
                  onClick={() => copy(PROD_URL, 'allowed-url')}
                  className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-900/30 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-900/50"
                >
                  {copied === 'allowed-url' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'allowed-url' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Download buttons */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm font-bold text-white mb-1">Download Pre-Configured EA Files</p>
          <p className="text-xs text-slate-400 mb-4">These are the source files (.mq4 / .mq5). Open in MetaEditor and press F7 to compile to a runnable .ex4 / .ex5 binary.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="/TradeAutomate-EA.mq4"
              download="TradeAutomate_Bridge.mq4"
              className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/40 bg-blue-600/20 px-4 py-4 hover:bg-blue-600/30 transition-colors group"
            >
              <div>
                <p className="text-sm font-bold text-blue-200 group-hover:text-white">TradeAutomate_Bridge.mq4</p>
                <p className="text-xs text-blue-400 mt-0.5">MetaTrader 4 · v1.10</p>
                <p className="text-[11px] text-slate-400 mt-1">Compiles to .ex4 — for MT4 terminals</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Download size={20} className="text-blue-400 group-hover:text-white" />
                <span className="text-[10px] text-blue-400">MT4</span>
              </div>
            </a>
            <a
              href="/TradeAutomate-EA.mq5"
              download="TradeAutomate_Bridge.mq5"
              className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/40 bg-violet-600/20 px-4 py-4 hover:bg-violet-600/30 transition-colors group"
            >
              <div>
                <p className="text-sm font-bold text-violet-200 group-hover:text-white">TradeAutomate_Bridge.mq5</p>
                <p className="text-xs text-violet-400 mt-0.5">MetaTrader 5 · v1.20</p>
                <p className="text-[11px] text-slate-400 mt-1">Compiles to .ex5 — for MT5 terminals</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Download size={20} className="text-violet-400 group-hover:text-white" />
                <span className="text-[10px] text-violet-400">MT5</span>
              </div>
            </a>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="/api/download-package?type=windows"
              className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              <Download size={12} />
              Windows Full Bundle (.zip)
            </a>
            <a
              href="/api/download-package?type=full"
              className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              <Download size={12} />
              Full Stack Bundle (.zip)
            </a>
          </div>
        </section>

        {/* Step-by-step setup */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-white">Step-by-Step Setup Guide</p>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden">
              {(['MT4', 'MT5'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${platform === p ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">
                  {s.step}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{s.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                  {s.step === '4' && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-violet-300 font-mono">
                        {PROD_URL}
                      </code>
                      <button
                        onClick={() => copy(PROD_URL, `step4-${platform}`)}
                        className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                      >
                        {copied === `step4-${platform}` ? <Check size={10} /> : <Copy size={10} />}
                        {copied === `step4-${platform}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Connection modes */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: Monitor,
              title: '1-Click Local',
              badge: 'Recommended',
              badgeColor: 'bg-green-600',
              desc: 'Run MT4/MT5 on the same PC as your browser. EA connects directly to the cloud dashboard.',
            },
            {
              icon: Server,
              title: 'VPS 24/7',
              badge: '24/7',
              badgeColor: 'bg-blue-600',
              desc: 'Install MT4/MT5 on a Windows VPS. EA keeps running around the clock without a local PC.',
            },
            {
              icon: Zap,
              title: 'Webhook Feed',
              badge: 'Advanced',
              badgeColor: 'bg-violet-600',
              desc: 'Send signals programmatically via POST to the API. Best for custom strategy engines.',
            },
          ].map((m) => (
            <div key={m.title} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center gap-2 mb-2">
                <m.icon size={16} className="text-slate-400" />
                <span className="text-sm font-semibold text-white">{m.title}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${m.badgeColor}`}>{m.badge}</span>
              </div>
              <p className="text-xs text-slate-400">{m.desc}</p>
            </div>
          ))}
        </section>

        {/* API reference */}
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <p className="text-sm font-bold text-white mb-3">API Endpoint Reference</p>
          <div className="space-y-2 text-xs font-mono">
            {[
              { method: 'GET', path: '/api/signals?client_id=XXXX', desc: 'EA polls for latest signal' },
              { method: 'POST', path: '/api/signals', desc: 'EA sends heartbeat / execution / trade_result events' },
              { method: 'GET', path: '/api/signals?status=1&client_id=XXXX', desc: 'Dashboard polls terminal status + open trades' },
              { method: 'GET', path: '/api/signals?stats=1&client_id=XXXX', desc: 'Fetch AI learning stats (win rate, symbol perf)' },
            ].map((r) => (
              <div key={r.path} className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.method === 'GET' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>{r.method}</span>
                <code className="text-slate-300">{r.path}</code>
                <span className="text-slate-500 font-sans">— {r.desc}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

