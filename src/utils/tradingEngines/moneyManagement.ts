import type { BotConfig, BotStats } from './types';

/** Next stake after a result, per money-management mode. FLAT / MARTINGALE / GRID. */
export function nextStake(cfg: BotConfig, stats: BotStats): number {
  const base = Math.max(0.35, cfg.stake);
  if (cfg.moneyManagement === 'FLAT') return base;
  if (cfg.moneyManagement === 'MARTINGALE') {
    if (stats.lossStreak <= 0) return base;
    if (stats.lossStreak > cfg.maxMartingaleSteps) return base; // reset, step cap hit
    return Number((base * Math.pow(cfg.martingaleMultiplier, stats.lossStreak)).toFixed(2));
  }
  // GRID: scale by number of currently open stacked contracts
  return Number((base * (1 + 0.5 * stats.openContracts)).toFixed(2));
}

export function hitHardStop(cfg: BotConfig, stats: BotStats): boolean {
  if (stats.lossStreak >= cfg.maxLossStreak) return true;
  if (cfg.stopLoss !== undefined && stats.pnl <= -cfg.stopLoss) return true;
  if (cfg.takeProfit !== undefined && stats.pnl >= cfg.takeProfit) return true;
  return false;
}
