'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, Menu, X } from 'lucide-react';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/download', label: 'Download' },
  { href: '/settings', label: 'Settings' },
  { href: '/privacy', label: 'Privacy' },
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
            Dark Venus Auto Bot
          </Link>
          <span className="hidden items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Auto Bot Active
          </span>
          <span className="hidden items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 lg:inline-flex">
            Broker Sync
          </span>
        </div>

        <nav className="hidden items-center gap-2 text-xs font-semibold text-slate-300 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-2 py-1 hover:bg-slate-800 hover:text-violet-200">
              {link.label}
            </Link>
          ))}
          <a
            href="/TradeAutomate-EA.mq4"
            download
            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-white hover:bg-violet-500"
          >
            <Download size={12} />
            EA
          </a>
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
          <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Auto Bot Active
          </div>
          <div className="flex flex-col gap-2 text-sm font-medium text-slate-200">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 hover:bg-slate-800">
                {link.label}
              </Link>
            ))}
            <a href="/TradeAutomate-EA.mq4" download className="rounded-lg px-2 py-1 hover:bg-slate-800" onClick={() => setOpen(false)}>
              Download EA
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
