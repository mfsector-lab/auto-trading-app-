import Nav from '@/components/Nav';
import ScannerApp from './ScannerApp';

export const metadata = {
  title: 'H4 Forex Head & Shoulders Scanner | Dark Venus',
};

export default function ScannerPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <Nav />
      <main className="flex flex-1 flex-col">
        <ScannerApp />
      </main>
    </div>
  );
}
