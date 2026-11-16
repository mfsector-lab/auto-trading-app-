'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/scanner', label: 'H4 Scanner' },
  { href: '/macro-feed', label: 'Macro & News' },
  { href: '/settings', label: 'Settings' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/join', label: 'Join' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('tradeautomate-theme') ?? 'dark';
    document.documentElement.setAttribute('data-theme', storedTheme);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-violet-500/20 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1540px] items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-bold tracking-[0.18em] text-white uppercase">
            Dark Venus · H4 Scanner
          </Link>
          <span className="hidden items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            H4 SCANNER ENGINE: LIVE
          </span>
        </div>

        <nav className="hidden items-center gap-2 text-xs font-semibold text-slate-300 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-2 py-1 hover:bg-slate-800 hover:text-violet-200">
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-violet-500/20 bg-slate-800 p-2 text-slate-200 md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-violet-500/20 bg-slate-950 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2 text-sm font-medium text-slate-200">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 hover:bg-slate-800">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
