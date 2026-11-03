import type { BotConfig, StrategyType, TickData } from './types';

export const STRATEGIES: Array<{ type: StrategyType; label: string; needsBarrier: boolean }> = [
  { type: 'DIGITMATCH', label: 'Matches (exact digit)', needsBarrier: true },
  { type: 'DIGITDIFF', label: 'Differs (not digit)', needsBarrier: true },
  { type: 'EVEN', label: 'Even', needsBarrier: false },
  { type: 'ODD', label: 'Odd', needsBarrier: false },
  { type: 'OVER', label: 'Over N', needsBarrier: true },
  { type: 'UNDER', label: 'Under N', needsBarrier: true },
];

export function lastDigit(quote: number): number {
  const s = quote.toFixed(4).replace(/0+$/, '');
  return Number(s[s.length - 1]);
}

/** Build the Deriv proposal payload for one entry of this strategy. */
export function buildProposalParams(cfg: BotConfig, stake: number, currency: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    amount: Number(stake.toFixed(2)),
    basis: 'stake',
    contract_type: cfg.strategy,
    currency,
    duration: 1,
    duration_unit: 't',
    symbol: cfg.symbol,
  };
  if (cfg.strategy === 'DIGITMATCH' || cfg.strategy === 'DIGITDIFF') {
    base.barrier = String(cfg.digit ?? 0);
  } else if (cfg.strategy === 'OVER' || cfg.strategy === 'UNDER') {
    base.barrier = String(cfg.overUnderBarrier ?? 5);
  }
  return base;
}

/** Does the AI/analysis layer agree with entering this strategy right now? */
export function strategyWantsEntry(cfg: BotConfig, history: TickData[], ai: { recommendation: string } | null): boolean {
  if (!cfg.followAi || !ai) return true;
  const last = history[history.length - 1];
  if (!last) return false;
  switch (cfg.strategy) {
    case 'ODD': return ai.recommendation.includes('Odd');
    case 'EVEN': return ai.recommendation.includes('Even');
    case 'DIGITMATCH': return ai.recommendation.includes(`digit ${cfg.digit}`) && ai.recommendation.includes('high');
    case 'DIGITDIFF': return ai.recommendation.includes(`digit ${cfg.digit}`) && ai.recommendation.includes('low');
    case 'OVER': return ai.recommendation.includes('high range');
    case 'UNDER': return ai.recommendation.includes('low range');
    default: return true;
  }
}
