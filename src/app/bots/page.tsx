import Nav from '@/components/Nav';
import BotManager from '@/components/bots/BotManager';

export const metadata = {
  title: 'AI Multi-Bot Engine | Dark Venus',
};

export default function BotsPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <BotManager />
    </div>
  );
}
