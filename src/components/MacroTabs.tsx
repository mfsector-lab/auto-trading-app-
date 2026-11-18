import Link from 'next/link';

const TABS = [
  { href: '/macro-feed', label: 'Live Calendar' },
  { href: '/macro/heatmap', label: 'US Economic Heatmap' },
  { href: '/macro/cot', label: 'COT Data History' },
  { href: '/macro/scorecard', label: 'Scorecard' },
  { href: '/macro/standings', label: 'Standings' },
];

export default function MacroTabs({ active }: { active: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${active === t.href ? 'border-blue-400/50 bg-blue-500/15 text-blue-200' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
