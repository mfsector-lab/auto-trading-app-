/**
 * Minimal Deriv WebSocket client with authorize, tick subscription,
 * keepalive ping and exponential-backoff reconnect.
 */
import { derivWsUrl } from './config';

type Handler = (data: Record<string, unknown>) => void;

export class DerivSocket {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pending = new Map<number, Handler>();
  private tickHandlers = new Map<string, Set<Handler>>();
  private balanceHandlers = new Set<Handler>();
  private contractHandlers = new Map<string, Set<Handler>>();
  private balanceReqHandlers = new Set<Handler>();
  private openHandlers = new Set<Handler>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private backoffMs = 1000;
  public closedByUser = false;
  public authorized = false;

  connect(onOpen?: Handler, onClose?: Handler): void {
    this.closedByUser = false;
    try {
      this.ws = new WebSocket(derivWsUrl());
    } catch {
      this.scheduleReconnect(onOpen, onClose);
      return;
    }
    this.ws.onopen = () => {
      this.backoffMs = 1000;
      this.startPing();
      onOpen?.({});
    };
    this.ws.onmessage = (evt) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(evt.data));
      } catch {
        return;
      }
      const reqId = Number(msg.req_id);
      if (reqId && this.pending.has(reqId)) {
        const h = this.pending.get(reqId);
        this.pending.delete(reqId);
        h?.(msg);
        return;
      }
      const sub = msg.subscription as Record<string, unknown> | undefined;
      const echo = (msg.echo_req as Record<string, unknown> | undefined)?.ticks as string | undefined;
      if (sub && echo) {
        const handlers = this.tickHandlers.get(echo);
        handlers?.forEach((h) => h(msg));
        return;
      }
      if (sub && (msg.balance as unknown)) {
        this.balanceHandlers.forEach((h) => h(msg.balance as Record<string, unknown>));
        return;
      }
      if (msg.proposal_open_contract) {
        const poc = msg.proposal_open_contract as Record<string, unknown>;
        const cid = String(poc.contract_id ?? '');
        this.contractHandlers.get(cid)?.forEach((h) => h(poc));
        return;
      }
    };
    this.ws.onclose = () => {
      this.stopPing();
      onClose?.({});
      if (!this.closedByUser) this.scheduleReconnect(onOpen, onClose);
    };
    this.ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect(onOpen?: Handler, onClose?: Handler): void {
    if (this.closedByUser) return;
    setTimeout(() => this.connect(onOpen, onClose), this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, 30000);
  }

  onBalance(h: Handler): void {
    this.balanceHandlers.add(h);
  }

  onContract(contractId: string, h: Handler): void {
    if (!this.contractHandlers.has(contractId)) this.contractHandlers.set(contractId, new Set());
    this.contractHandlers.get(contractId)!.add(h);
  }

  offContract(contractId: string, h: Handler): void {
    this.contractHandlers.get(contractId)?.delete(h);
  }

  async subscribeBalance(): Promise<Record<string, unknown>> {
    const res = await this.send({ balance: 1, subscribe: 1 });
    return (res.balance as Record<string, unknown>) ?? {};
  }

  async proposal(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.send({ proposal: 1, ...params });
  }

  async buy(proposalId: string, maxPrice: number): Promise<Record<string, unknown>> {
    return this.send({ buy: proposalId, price: maxPrice });
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ ping: 1 }), 25000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  send(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('socket not open'));
        return;
      }
      const req_id = this.reqId++;
      this.pending.set(req_id, (data) => {
        if (data.error) reject(new Error(String((data.error as Record<string, unknown>).message ?? 'deriv error')));
        else resolve(data);
      });
      this.ws.send(JSON.stringify({ ...payload, req_id }));
    });
  }

  async authorize(token: string): Promise<Record<string, unknown>> {
    const res = await this.send({ authorize: token });
    this.authorized = true;
    return res;
  }

  subscribeTicks(symbol: string, handler: Handler): Promise<void> {
    if (!this.tickHandlers.has(symbol)) this.tickHandlers.set(symbol, new Set());
    this.tickHandlers.get(symbol)!.add(handler);
    return this.send({ ticks: symbol, subscribe: 1 }).then(() => undefined);
  }

  close(): void {
    this.closedByUser = true;
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }
}
