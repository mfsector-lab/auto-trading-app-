import Nav from '@/components/Nav';
import MacroApp from './MacroApp';

export const metadata = {
  title: 'Live Macro & Smart Money Intelligence | Dark Venus',
};

export default function MacroFeedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <Nav />
      <main className="flex flex-1 flex-col">
        <MacroApp />
      </main>
    </div>
  );
}
