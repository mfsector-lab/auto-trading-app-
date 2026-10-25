'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';

export default function SettingsPage() {
  const [tab, setTab] = useState<'general' | 'bot' | 'notifications' | 'security'>('general');
  const [showToken, setShowToken] = useState(false);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('tradeautomate-theme') ?? 'dark';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(storedTheme);
    document.documentElement.setAttribute('data-theme', storedTheme);
  }, []);

  const onThemeChange = (value: string) => {
    setTheme(value);
    window.localStorage.setItem('tradeautomate-theme', value);
    document.documentElement.setAttribute('data-theme', value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 text-gray-900">
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="mt-1 text-xs text-gray-500">Configure profile, bot behavior, alerts, and security controls.</p>
        </section>

        <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {[
            ['general', 'General'],
            ['bot', 'Bot'],
            ['notifications', 'Notifications'],
            ['security', 'Security'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold ${tab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-4 text-xs">
            <label className="space-y-1"><span className="text-gray-500">Name</span><input className="w-full rounded border border-gray-200 px-2 py-2" defaultValue="TradeAutomate Admin" /></label>
            <label className="space-y-1"><span className="text-gray-500">Timezone</span><input className="w-full rounded border border-gray-200 px-2 py-2" defaultValue="UTC" /></label>
            <label className="space-y-1"><span className="text-gray-500">Theme</span><select value={theme} onChange={(e) => onThemeChange(e.target.value)} className="w-full rounded border border-gray-200 px-2 py-2"><option value="light">Light</option><option value="dark">Dark</option><option value="emerald">Emerald</option><option value="sunset">Sunset</option></select></label>
          </div>
        )}

        {tab === 'bot' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-4 text-xs">
            <label className="space-y-1"><span className="text-gray-500">Poll interval (sec)</span><input type="number" className="w-full rounded border border-gray-200 px-2 py-2" defaultValue="5" /></label>
            <label className="space-y-1"><span className="text-gray-500">Default lot</span><input type="number" className="w-full rounded border border-gray-200 px-2 py-2" defaultValue="0.10" /></label>
            <label className="space-y-1"><span className="text-gray-500">Slippage</span><input type="number" className="w-full rounded border border-gray-200 px-2 py-2" defaultValue="3" /></label>
            <label className="space-y-1"><span className="text-gray-500">Scalp mode</span><select className="w-full rounded border border-gray-200 px-2 py-2"><option>true</option><option>false</option></select></label>
            <label className="space-y-1 md:col-span-2"><span className="text-gray-500">AI Verify</span><select className="w-full rounded border border-gray-200 px-2 py-2"><option>Enabled</option><option>Disabled</option></select></label>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-700 space-y-2">
            <p>Email alerts: Enabled</p>
            <p>Push alerts: Enabled</p>
            <p>Critical error alerts: Enabled</p>
          </div>
        )}

        {tab === 'security' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs space-y-3">
            <label className="space-y-1 block">
              <span className="text-gray-500">Auth token</span>
              <div className="flex gap-2">
                <input type={showToken ? 'text' : 'password'} defaultValue="YOUR_AUTH_TOKEN" className="w-full rounded border border-gray-200 px-2 py-2" />
                <button onClick={() => setShowToken((v) => !v)} className="rounded border border-gray-200 px-3 py-2 text-gray-700">{showToken ? 'Hide' : 'Show'}</button>
              </div>
            </label>
            <p className="text-gray-600">Use token rotation and IP allow-listing for production.</p>
          </div>
        )}
      </main>
    </div>
  );
}
