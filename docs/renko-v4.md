# Renko Version 4

Choose **Renko Version 4** from the chart type menu in Trading or Scalper.
Open Chart settings to change brick size, reversal distance or the trend line.

## Price rules

- A brick forms on a complete price move. There is no initial artificial brick,
  unfinished projection brick or candle-close timer.
- Default sizing is 0.04% of the first historical open, rounded to the instrument's
  tick size. This size stays fixed. Fixed points and an explicit size override
  are also available.
- Continuation requires one full brick. Reversal requires two full bricks by
  default; the reversal setting supports 2–20 bricks.
- The step trend follows confirmed bricks. Its level is one less than the
  reversal distance behind the brick close. Previously confirmed points stay fixed.

## History and recovery

Historical initialization uses a consistent 1-minute interval, or the shortest
available intraday minute/hour interval. It uses opens to seed the price grid
and closes to advance it; it does not guess the ordering of candle highs and lows.
Historical OHLC cannot reproduce the full tick path.

Live ticks are applied immediately. Broker corrections and older history pages
do not rewrite committed bricks. Older pages become available as source data;
changing sizing creates a separate calculation using the loaded history.

The pane retains its observed price path during chart rebuilds and replay.
A bounded browser cache saves the last 10,000 confirmed bricks per calculation
and at most eight configurations per pane. Cache writes are deferred away from
tick ingestion and also flushed when leaving the page. Reload recovery requires
browser storage; clearing it, a storage quota failure, or opening a new browser
profile falls back to OHLC initialization. Missing ticks while the application
is closed cannot be reconstructed exactly.

The chart engine performs a complete redraw on visibility return or window
refocus. Repainting the canvas does not change the committed price path.

## Feed and reversal limits

The algorithm is not tied to an index or country. Prices must be available from
the connected feed; this chart type does not add worldwide data access. Existing
exchange session validation still applies. Increasing the reversal distance
filters smaller reversals but no Renko filter eliminates all whipsaws. Updates
do not intentionally wait, but broker, network and screen refresh latency remain.
