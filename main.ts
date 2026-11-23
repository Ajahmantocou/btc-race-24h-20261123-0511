// Breakout Rider — a Donchian-channel breakout bot for cbBTC/USDC.
//
// Idea (designed from the dev window, not fitted to it): on 1-minute bars the
// market pays about 30 bps per full round trip (4 bps fee + 2 bps slippage +
// ~9-11 bps of price impact per side on ~$1,000). Frequent trading therefore
// loses money to costs alone, so this bot trades rarely and only on a real
// regime change: it buys the first close that breaks above the high of the
// previous hour, then rides the move until the price breaks below the low of
// the previous two hours or gives back 300 bps from its peak. In flat, choppy
// stretches it simply holds cash and waits; a breakout that fails costs one
// round trip, a breakout that runs pays for many.
//
// Rules, all deterministic (pure functions of the bars seen so far):
//   - Entry: flat, not in warm-up, at least 30 bars since the last exit, and
//     the close is above the highest high of the previous 60 bars.
//   - Size: the whole cash balance (long-only, one position, no leverage).
//   - Exit: the close falls below the lowest low of the previous 120 bars
//     (current bar included), or the close has fallen 300 bps from the
//     highest close since entry (trailing stop).
//   - After an exit, a 30-bar cooldown blocks an immediate re-entry, so a
//     whipsaw cannot churn the account.
//   - max_slippage_bps 200: a 1-minute move is a few tens of bps at most, so
//     200 bps only guards against a freak gap, never a normal fill.
//
// No clock, no randomness, no network, no files outside the repository.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// A breakout needs a fresh 60-bar high; an exit needs a 120-bar low break.
const ENTRY_LOOKBACK = 60;
const EXIT_LOOKBACK = 120;
// Give back at most 300 bps from the peak close before exiting.
const TRAIL_STOP_BPS = 300;
// Bars to wait after an exit before a new entry may be taken.
const COOLDOWN_BARS = 30;
// 1-minute moves are tens of bps; 200 bps only stops a freak gap fill.
const MAX_SLIPPAGE_BPS = 200;
// Keep enough history for the longest lookback plus margin.
const KEEP_BARS = 256;
// Minimum buy notional: 1 USDC = 1_000_000 quote units.
const MIN_NOTIONAL = 1_000_000n;

// Bar history, raw integer prices (price_scale 5), oldest first.
const closes: bigint[] = [];
const highs: bigint[] = [];
const lows: bigint[] = [];

// Highest close since the entry decision; null while flat.
let peakSinceEntry: bigint | null = null;
// Seq of the batch on which the last exit was decided.
let lastExitSeq = -1000000;

function pushBar(bar: { o: string; h: string; l: string; c: string }): void {
  closes.push(BigInt(bar.c));
  highs.push(BigInt(bar.h));
  lows.push(BigInt(bar.l));
  while (closes.length > KEEP_BARS) {
    closes.shift();
    highs.shift();
    lows.shift();
  }
}

function maxOf(values: readonly bigint[], from: number, to: number): bigint {
  let best = values[from]!;
  for (let i = from + 1; i < to; i++) {
    if (values[i]! > best) best = values[i]!;
  }
  return best;
}

function minOf(values: readonly bigint[], from: number, to: number): bigint {
  let best = values[from]!;
  for (let i = from + 1; i < to; i++) {
    if (values[i]! < best) best = values[i]!;
  }
  return best;
}

await runBars({
  onBatch(state: BarsState, _batch: Batch) {
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    pushBar(bar);
    const close = BigInt(bar.c);
    const held = state.positions.get(SYMBOL);
    const holding = held !== undefined && held.qty > 0n;

    if (holding) {
      if (peakSinceEntry === null || close > peakSinceEntry) peakSinceEntry = close;
      // Exit 1: close breaks below the lowest low of the last 120 bars.
      const loFrom = Math.max(0, lows.length - EXIT_LOOKBACK);
      const lowestLow = minOf(lows, loFrom, lows.length);
      // Exit 2: trailing stop — 300 bps given back from the peak close.
      const trailBps =
        peakSinceEntry !== null
          ? (Number(peakSinceEntry - close) / Number(close)) * 10000
          : 0;
      if (close < lowestLow || trailBps >= TRAIL_STOP_BPS) {
        peakSinceEntry = null;
        lastExitSeq = state.seq;
        return [
          { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS },
        ];
      }
      return [];
    }

    // Flat: look for a breakout entry.
    peakSinceEntry = null;
    if (state.warmingUp) return [];
    if (state.seq - lastExitSeq < COOLDOWN_BARS) return [];
    if (state.cash < MIN_NOTIONAL) return [];
    // Need 60 prior bars plus the current one.
    if (closes.length <= ENTRY_LOOKBACK) return [];
    const highestHigh = maxOf(highs, highs.length - 1 - ENTRY_LOOKBACK, highs.length - 1);
    if (close > highestHigh) {
      peakSinceEntry = close;
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  },
});
