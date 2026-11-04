/**
 * Auto-reply email via Resend (free tier works, no card needed).
 * Set RESEND_API_KEY + MAIL_FROM in Vercel env vars to activate.
 * Without a key, join still works — the PIN is shown on screen instead.
 */
import type { Account } from './store';

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function diagramHtml(a: Account): string {
  const initial = (a.name || '?').trim().charAt(0).toUpperCase();
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;border:1px solid #7c3aed;border-radius:16px;background:#0b0f1a;font-family:Arial,sans-serif;color:#e5e7eb">
    <tr><td style="padding:20px;text-align:center;background:linear-gradient(135deg,#2e1065,#0b0f1a);border-radius:15px 15px 0 0">
      <table cellpadding="0" cellspacing="0" align="center"><tr>
        <td style="width:56px;height:56px;border-radius:50%;background:#7c3aed;color:#fff;font-size:26px;font-weight:bold;text-align:center;line-height:56px">${initial}</td>
        <td style="padding-left:14px;text-align:left">
          <div style="font-size:16px;font-weight:bold;color:#fff">${a.name}</div>
          <div style="font-size:12px;color:#a78bfa">${a.isOwner ? 'Owner profile' : 'Dark Venus trader'}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px">
      <div style="font-size:12px;color:#9ca3af">Your access PIN</div>
      <div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#22d3ee;padding:8px 0">${a.pin}</div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:14px">Keep it — you use it to open your profile on the site.</div>
      <table width="100%" style="font-size:12px;color:#d1d5db">
        <tr><td style="padding:4px 0;color:#9ca3af">Email</td><td align="right">${a.email}</td></tr>
        <tr><td style="padding:4px 0;color:#9ca3af">Joined</td><td align="right">${a.joinedAt.slice(0, 10)}</td></tr>
        <tr><td style="padding:4px 0;color:#9ca3af">Engine</td><td align="right">Dark Venus Auto Bot</td></tr>
        <tr><td style="padding:4px 0;color:#9ca3af">Markets</td><td align="right">Forex · Gold · Crypto · Indices</td></tr>
      </table>
      <a href="https://tradeautomate-ai.vercel.app" style="display:block;margin-top:16px;background:#7c3aed;color:#fff;text-decoration:none;padding:10px;border-radius:10px;font-weight:bold;font-size:13px">Open my profile</a>
    </td></tr>
  </table>`;
}

export async function sendPinEmail(a: Account): Promise<{ sent: boolean; detail: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Dark Venus <onboarding@resend.dev>';
  if (!key) return { sent: false, detail: 'RESEND_API_KEY not set — PIN shown on screen instead' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: a.email,
        subject: `Your Dark Venus PIN: ${a.pin}`,
        html: `<div style="background:#090d1a;padding:24px;font-family:Arial,sans-serif">
          <h2 style="color:#fff;font-family:Arial">Welcome to Dark Venus Auto Bot, ${a.name}</h2>
          ${diagramHtml(a)}
          <p style="color:#6b7280;font-size:11px;margin-top:16px">You requested access to the Dark Venus trading platform. This is your automated welcome message.</p>
        </div>`,
      }),
    });
    return { sent: res.ok, detail: res.ok ? 'email sent' : `provider ${res.status}` };
  } catch (e) {
    return { sent: false, detail: e instanceof Error ? e.message : 'send failed' };
  }
}
