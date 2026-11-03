import Nav from '@/components/Nav';

export const metadata = {
  title: 'Sygnal Dashboard | Dark Venus Auto Bot',
};

export default function SygnalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <Nav />
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-violet-500/20 bg-slate-900/60 px-4 py-2">
          <p className="text-xs font-semibold text-slate-300">
            Sygnal autonomous AI trading dashboard — runs in a live frame
          </p>
          <a
            href="https://automated-trading-ai.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
          >
            Open full screen
          </a>
        </div>
        <iframe
          src="https://automated-trading-ai.vercel.app"
          title="Sygnal Dashboard"
          className="min-h-[calc(100vh-96px)] w-full flex-1 border-0 bg-white"
          allow="clipboard-write; fullscreen"
        />
      </main>
    </div>
  );
}
