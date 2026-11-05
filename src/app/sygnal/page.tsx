import Nav from '@/components/Nav';
import SygnalApp from './SygnalApp';

export const metadata = {
  title: 'Sygnal | Dark Venus',
};

export default function SygnalPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <SygnalApp />
    </div>
  );
}
