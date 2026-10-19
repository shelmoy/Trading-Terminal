# Live watchlist changes and native categories

The commodity and index watchlists now use compact two-line rows showing the
selected contract's last price, day point change and day percentage change.
Positive/negative changes use the existing OpenAlgo emerald/rose colours in
light and dark mode. Expiry selection and click-to-chart behavior remain.

## Data and calculation

- Incoming ticks use the existing shared market-data connection, buffered by
  animation frames. Change and percentage recalculate from each received price:
  `change = LTP - previous close`; `change % = change / previous close * 100`.
- The connected broker's valid `prev_close` is the reference, including a
  legitimately unchanged price. Missing references use the existing cached
  daily-history resolver, paced sequentially with a 500 ms gap. Failed
  resolutions are remembered for the session rather than retried every tick.
- Saved watchlists use the same calculation. Their former default column
  selection gains the point-change column once; deliberate custom column
  choices are retained. Users can still customise columns afterward.
- Watchlists retain the latest received tick until a newer quote snapshot
  arrives. Quiet instruments no longer revert to an older snapshot merely
  because the tick is more than five seconds old. Other price-hook consumers
  keep their existing policy because this option defaults to false.
- No simulated price movement is added. REST quote snapshots remain on the
  existing 60-second fallback interval. Missing prices or closes show a dash.
  Live delivery still depends on the connected broker's feed and entitlements.

## Groups and performance

Commodities are grouped as Energy, Bullion, Base metals, Electricity,
Agriculture, Ferrous metals, Commodity indices and Other commodities as
applicable. Index listings group into NSE indices and BSE indices.

Each section can collapse independently; Collapse all / Expand all is also
available. Collapsed rows release their watchlist subscriptions. Only the
current page of up to 40 selected contracts is subscribed. Expiry choices do
not subscribe every alternative contract. Number/date formatters and expiry
labels are reused to keep quote renders inexpensive.

Applies to Trading and Scalper on both the Kotak (5000) and FYERS (5001)
installations. This is a frontend update; no server restart, credential
change, database migration, order placement or order cancellation is needed.

Production TypeScript/Vite compilation and focused frontend lint completed;
no automated tests were added or run. Existing large-chunk build warnings
remain. Refresh the browser tab to use the updated watchlists.
