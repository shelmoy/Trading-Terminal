# FYERS invalid history candle and watchlist quote traffic

The reported screenshot showed two separate data problems.

## Findings

1. The FYERS instance's persisted CRUDEOIL19OCT26FUT one-minute history
   contained 5,970 candles, including one inconsistent candle at timestamp
   1790358300: open 8849, high 8856, low 8849, close 8846. The chart SDK
   correctly rejects a close below the reported low. One malformed historical
   row blocked validation of the entire series.
2. FYERS multiquotes normally enriches derivatives with a separate depth
   request per contract for open interest. The new 31-row watchlist and the
   shared feed's REST fallback did not need OI but triggered those calls.
3. A background Scalper prewarmer also requested histories for indices and
   option legs unrelated to the displayed chart. Combined traffic repeatedly
   produced upstream HTTP 429 responses. The existing limiter assumed old
   common quotas and retried some responses after only 50 milliseconds.

A direct read-only broker quote request still returned successful CRUDEOIL
and GOLD prices with previous closes during diagnosis. This was not an
authentication failure or evidence of a day-long data lockout.

## Repair

- Added optional `include_oi` to multiquotes, defaulting to true for backward
  compatibility. Watchlists and the shared LTP/quote fallback send false.
  FYERS serves those requests through bulk quotes without per-contract depth
  calls. Existing clients that explicitly need OI retain their existing path.
- FYERS data pacing defaults conservatively to Standard (1.35 seconds between
  process-wide calls, below the 50/minute ceiling). `FYERS_API_PLAN=prime` is
  an explicit opt-in to faster pacing. Account/transaction requests use their
  independent existing limiter, so chart traffic cannot book their slots.
- A market-data queue longer than five seconds is refused rather than holding
  unbounded request threads. HTTP 429 installs a shared cooldown and retries
  no faster than the exponential backoff or broker requested delay. Exhausted
  retries propagate a busy response instead of triggering nested history
  retries or appearing as successful empty quote/history data.
- FYERS all-index/all-leg background history prewarming is disabled by default.
  The current chart and selected legs still load on demand. Advanced setups
  can explicitly opt in with `FYERS_HISTORY_PREWARM=true` when budget permits.
- Invalid broker candles are quarantined when loading persisted server history
  and when fetching fresh history, with a server warning and dropped-candle
  metadata. If all returned candles are invalid, the request fails clearly.
  Valid OHLC values are retained exactly; missing candles are not invented.
- Browser cache hydration, chart feed loading and prefetch also filter malformed
  candles before SDK history validation, covering old cached copies after refresh.

The quarantined candle is a genuine gap until the broker supplies a corrected
row. No high, low or close is fabricated to make it pass validation.

## Installation and checks

Applied to both local instances, preserving their separate credentials, broker
tokens, existing watchlists and custom chart configuration. Backup branch and
private configuration/database/cache snapshots retained before activation.
Services need a brief restart to load the backend changes, followed by a browser
refresh to replace the old watchlist and cached history code.

TypeScript/Vite build, focused frontend lint and focused Python lint completed.
Broader FYERS data/order modules retain pre-existing exception-style / duplicate
exception-handler lint findings. No automated tests were added or run, and no
orders were placed, changed or cancelled.

Official current limits:
[FYERS Standard and Prime API limits](https://support.fyers.in/portal/en/kb/articles/what-are-the-fyers-api-rate-limits-for-standard-and-prime-plans).
