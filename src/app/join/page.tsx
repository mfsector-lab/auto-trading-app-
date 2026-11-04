'use client';

import { useState } from 'react';
import Nav from '@/components/Nav';

interface JoinResult {
  ok: boolean;
  created?: boolean;
  pin?: string;
  name?: string;
  email?: string;
  emailSent?: boolean;
  mailConfigured?: boolean;
  error?: string;
}

function ProfileDiagram({ name, email, pin }: { name: string; email: string; pin: string }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <svg viewBox="0 0 360 220" className="mt-4 w-full max-w-sm rounded-2xl border border-violet-500/40 bg-slate-950">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2e1065" />
          <stop offset="100%" stopColor="#0b0f1a" />
        </linearGradient>
      </defs>
      <rect width="360" height="220" fill="url(#g)" rx="16" />
      <circle cx="60" cy="60" r="28" fill="#7c3aed" />
      <text x="60" y="70" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="bold">{initial}</text>
      <text x="100" y="55" fill="#fff" fontSize="16" fontWeight="bold">{name}</text>
      <text x="100" y="74" fill="#a78bfa" fontSize="11">Dark Venus trader</text>
      <text x="30" y="120" fill="#9ca3af" fontSize="10">YOUR ACCESS PIN</text>
      <text x="30" y="152" fill="#22d3ee" fontSize="30" fontWeight="bold" letterSpacing="8">{pin}</text>
      <text x="30" y="180" fill="#9ca3af" fontSize="10">Email: {email}</text>
      <text x="30" y="198" fill="#6b7280" fontSize="9">Keep this PIN — it opens your profile on the site.</text>
    </svg>
  );
}

export default function JoinPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/auth/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const d = (await res.json()) as JoinResult;
      setResult(d);
    } catch {
      setResult({ ok: false, error: 'Network error — try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <h1 className="text-xl font-bold text-white">Request to join Dark Venus</h1>
        <p className="mt-1 text-xs text-slate-400">
          Enter your email — the system auto-generates your PIN and emails it to you with a profile diagram.
        </p>

        <div className="mt-4 space-y-3 rounded-2xl border border-violet-500/30 bg-slate-900/70 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            type="email"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
          />
          <button
            onClick={submit}
            disabled={busy || !email.includes('@')}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {busy ? 'Requesting…' : 'Request access'}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-200">
            {result.ok ? (
              <>
                <p className="font-bold text-emerald-400">
                  {result.created ? 'Account created.' : 'You already have an account.'}
                </p>
                {result.emailSent ? (
                  <p className="mt-1 text-xs text-slate-400">Check your email — your PIN and profile diagram were sent automatically.</p>
                ) : (
                  <p className="mt-1 text-xs text-amber-300">
                    Your PIN is below (email auto-reply activates once RESEND_API_KEY is set on the deployment).
                  </p>
                )}
                <ProfileDiagram name={result.name ?? ''} email={result.email ?? ''} pin={result.pin ?? ''} />
                <a href="/" className="mt-3 block rounded-xl bg-violet-600 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-violet-500">
                  Open my profile now
                </a>
              </>
            ) : (
              <p className="text-rose-400">{result.error}</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
