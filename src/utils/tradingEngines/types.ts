export type StrategyType =
  | 'DIGITMATCH'
  | 'DIGITDIFF'
  | 'EVEN'
  | 'ODD'
  | 'OVER'
  | 'UNDER';

export type MoneyManagement = 'FLAT' | 'MARTINGALE' | 'GRID';

export interface BotConfig {
  id: string;
  name: string;
  strategy: StrategyType;
  symbol: string;            // e.g. R_10, R_25, R_100, 1HZ100V
  digit?: number;            // DIGITMATCH/DIGITDIFF barrier 0-9
  overUnderBarrier?: number; // OVER/UNDER barrier 0-9
  stake: number;             // base stake
  moneyManagement: MoneyManagement;
  martingaleMultiplier: number;  // e.g. 2.1
  maxMartingaleSteps: number;
  gridLevels: number;            // GRID: max concurrent stacked contracts
  cooldownTicks: number;         // min ticks between entries
  maxLossStreak: number;         // hard stop
  takeProfit?: number;           // absolute currency, optional
  stopLoss?: number;             // absolute currency, optional
  followAi: boolean;             // only enter when AI scanner agrees
}

export interface BotStats {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  lossStreak: number;
  currentStake: number;
  openContracts: number;
  lastError: string;
  running: boolean;
}

export interface TickData {
  epoch: number;
  quote: number;
  digit: number;
}
