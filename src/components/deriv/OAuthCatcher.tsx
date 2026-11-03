'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { consumeOAuthParamsIfPresent } from '@/lib/deriv/session';

/**
 * Deriv redirects to the app URL registered in their dashboard, which may be
 * the site root (not /deriv/callback). This catcher runs globally: if OAuth
 * params land anywhere, save the session and forward to the digit engine.
 */
export default function OAuthCatcher() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('acct1')) return;
    const accounts = consumeOAuthParamsIfPresent();
    if (accounts.length > 0) {
      router.replace('/deriv');
    }
  }, [router]);

  return null;
}
