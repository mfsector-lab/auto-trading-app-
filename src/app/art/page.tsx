import Nav from '@/components/Nav';
import ArtStudio from './ArtStudio';

export const metadata = {
  title: 'Art-Native Trading Platform | Dark Venus',
};

export default function ArtPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-[1540px] flex-1 px-4 py-6">
        <section className="rounded-2xl border border-fuchsia-500/30 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.18),transparent_40%),linear-gradient(180deg,#140a1f,#090d1a)] p-6 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300">Art-Native Trading Platform</p>
          <h1 className="mt-1 text-2xl font-bold">Where generative art meets the trading desk</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            A modular home for art-native markets: mint generative works, watch their provenance,
            and trade them — isolated under <code className="rounded bg-slate-800 px-1">/art</code> so
            the core Dark Venus engine is never touched.
          </p>
        </section>
        <ArtStudio />
      </main>
    </div>
  );
}
