'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { consumeOAuthParamsIfPresent, parseAccountsFromParams } from '@/lib/deriv/session';

export default function DerivCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Reading Deriv authorization response…');

  useEffect(() => {
    // Deriv may append params to the registered app URL rather than this path;
    // handle both shapes.
    let accounts = consumeOAuthParamsIfPresent();
    if (accounts.length === 0) {
      accounts = parseAccountsFromParams(window.location.search);
      if (accounts.length > 0) {
        // persist via same routine then clean
        consumeOAuthParamsIfPresent();
      }
    }
    if (accounts.length > 0) {
      setStatus(`Linked ${accounts.length} Deriv account(s). Redirecting to the digit engine…`);
      setTimeout(() => router.replace('/deriv'), 1500);
    } else {
      setStatus('No account data found in the redirect. Close this tab and try Connect again.');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <Nav />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full rounded-2xl border border-violet-500/30 bg-slate-900/70 p-6 text-center">
          <p className="text-sm font-semibold text-white">Deriv OAuth</p>
          <p className="mt-2 text-xs text-slate-400">{status}</p>
        </div>
      </main>
    </div>
  );
}
