[![Make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/c/btc-race-24h-20261123-0511)
[![Rank](https://make.fun/badge/btc-race-24h-20261123-0511/Ajahmantocou/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/c/btc-race-24h-20261123-0511)
[![Reward](https://make.fun/badge/btc-race-24h-20261123-0511/Ajahmantocou/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/c/btc-race-24h-20261123-0511)

# Breakout Rider — cbBTC/USDC trading bot

A bot for [Race a BTC trading bot live for 24 hours](https://make.fun/c/btc-race-24h-20261123-0511)
on Make.fun. It trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute
on-chain bars, starting from $1,000 of paper money, long-only, no leverage.

## Strategy

A full round trip costs about 30 bps (4 bps fee + 2 bps slippage + roughly
9–11 bps of price impact per side on a $1,000 order), so frequent trading
loses money to costs alone. This bot therefore trades rarely, and only on a
real regime change:

- **Entry — Donchian breakout:** when flat, buy the whole cash balance on
  the first close that breaks above the highest high of the previous 60 bars.
- **Exit — breakdown or trailing stop:** sell everything when the close
  falls below the lowest low of the previous 120 bars, or when the close has
  given back 300 bps from the highest close since entry.
- **Cooldown:** after an exit, wait 30 bars before a new entry, so a whipsaw
  cannot churn the account.
- In flat, choppy stretches the bot holds cash and waits. A failed breakout
  costs one round trip; a breakout that runs pays for many.

The bot is fully deterministic: every decision is a pure function of the bars
seen so far — no clock, no randomness, no network, no files outside this
repository. It uses only the Node standard library plus the kit's SDK shim
(vendored byte-identical under `vendor/`).

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, run as `node main.ts`)
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK shim, unmodified
- `.makefun/owner.json` — the entry's payout wallet

## Dev-window result (local grade)

| Metric | Value |
| --- | --- |
| Net PnL (dev, 1,440 bars) | +29.501082 USDC |
| Trades | 1 (win rate 1.0, 0 rejected orders) |
| Max drawdown | 1.9778% |
| Fees paid | 0.811966 USDC (net PnL at 2x fees: +28.678622 USDC) |
| Exposure | 93.96% of the window |
| Deterministic (2 runs, same `result_sha256`) | yes — `ae5c3d9549e366d2f167e93377feb2f5cf5bf14064aefe732eece0e228ccef26` |
| Guardrails | met (≥1 trade, drawdown ≤ 25%) |

The same logic was checked on 12-hour halves of the dev window: it trades in
every segment (a breakout in each half) rather than depending on a single
lucky bar, and it stays out of the market entirely when no breakout appears.
