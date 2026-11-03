import type { BotConfig, BotStats, TickData } from './types';
import { buildProposalParams, strategyWantsEntry } from './digitStrategies';
import { hitHardStop, nextStake } from './moneyManagement';
import type { DerivSocket } from '@/lib/deriv/ws';

const EMPTY_STATS: BotStats = {
  trades: 0, wins: 0, losses: 0, pnl: 0, lossStreak: 0,
  currentStake: 0, openContracts: 0, lastError: '', running: false,
};

/**
 * One bot = one state machine fed ticks by the manager. Places proposal+buy on
 * the authorized Deriv session; settles via proposal_open_contract.
 */
export class BotRunner {
  cfg: BotConfig;
  stats: BotStats = { ...EMPTY_STATS };
  private ticksSinceLastTrade = Infinity;
  private tracked = new Set<string>();
  private history: TickData[] = [];

  constructor(cfg: BotConfig) {
    this.cfg = cfg;
    this.stats.running = true;
  }

  stop(): void {
    this.stats.running = false;
  }

  pushTick(t: TickData, socket: DerivSocket, currency: string, ai: { recommendation: string } | null): void {
    this.history.push(t);
    if (this.history.length > 300) this.history.shift();
    this.ticksSinceLastTrade += 1;
    if (!this.stats.running) return;

    if (hitHardStop(this.cfg, this.stats)) {
      this.stats.running = false;
      this.stats.lastError = 'Hard stop reached (loss streak / SL / TP).';
      return;
    }
    if (this.ticksSinceLastTrade < this.cfg.cooldownTicks) return;
    if (this.cfg.moneyManagement === 'GRID' && this.stats.openContracts >= this.cfg.gridLevels) return;
    if (this.stats.openContracts > 0 && this.cfg.moneyManagement !== 'GRID') return;

    if (!strategyWantsEntry(this.cfg, this.history, ai)) return;

    const stake = nextStake(this.cfg, this.stats);
    void this.enter(socket, stake, currency);
    this.ticksSinceLastTrade = 0;
  }

  private async enter(socket: DerivSocket, stake: number, currency: string): Promise<void> {
    try {
      this.stats.currentStake = stake;
      const prop = await socket.proposal(buildProposalParams(this.cfg, stake, currency));
      const p = prop.proposal as Record<string, unknown> | undefined;
      const id = String(p?.id ?? '');
      const askPrice = Number(p?.ask_price ?? stake);
      if (!id) return;
      const bought = await socket.buy(id, askPrice);
      const b = bought.buy as Record<string, unknown> | undefined;
      const contractId = String(b?.contract_id ?? '');
      if (!contractId) return;

      this.stats.trades += 1;
      this.stats.openContracts += 1;
      this.tracked.add(contractId);

      socket.onContract(contractId, (poc) => {
        if (poc.is_sold !== 1) return;
        const profit = Number(poc.profit ?? 0);
        this.stats.pnl = Number((this.stats.pnl + profit).toFixed(2));
        if (profit >= 0) {
          this.stats.wins += 1;
          this.stats.lossStreak = 0;
        } else {
          this.stats.losses += 1;
          this.stats.lossStreak += 1;
        }
        this.stats.openContracts = Math.max(0, this.stats.openContracts - 1);
        this.tracked.delete(contractId);
      });
    } catch (e) {
      this.stats.lastError = e instanceof Error ? e.message : 'entry failed';
    }
  }
}
