# Scalper P&L and required margin

## Live broker P&L

The header identifies the broker from the authenticated OpenAlgo account. Live
P&L uses that broker's position ledger, including closed positions. Position
snapshots refresh every 10 seconds and after order events. Fresh shared-feed ticks
update the mark between snapshots without discarding partial-exit profits.

For adapters exposing `day_pnl_inputs` (Kotak and Zerodha):

    total = sell_value - buy_value - opening_value
            + net_quantity * current_broker_LTP * multiplier

Kotak's carry-forward amounts and today's buy/sell amounts are used directly.
The calculation follows Kotak's published position formula. It does not apply a
Zerodha post-close freeze or substitute historical chart candles. Other adapters
retain their reported P&L, with only the change in open-position value since the
broker's snapshot added for fresh ticks.

The dropdown separates closed-position totals from open-position totals. The
open-position total can include profits already realized by partial exits; it is
not labeled as unrealized P&L. Missing open-position valuations show unavailable.
An empty successful live positionbook correctly shows zero. Account, broker,
mode and IST date are separate snapshot scopes.

## Sandbox day P&L

Sandbox uses its own day ledger reconstructed from dated simulated executions.
Carried inventory is valued at the previous broker close; realized and open day
P&L are shown separately. Its existing closing-price policy and session calendar
remain in `useScalperPnlPrices`. Sandbox and broker positions are never combined.
Fees are excluded. The positions dock and account balance calculations are
independent of this header display.

## Required margin

Each Buy/Sell action requests one independent market-order estimate from the
logged-in broker through `/api/v1/margin`. Quantity is sent as a string of units,
matching `MarginPositionSchema`; lots are converted before reaching this API.
Requests are debounced on size/contract changes, refreshed after order events
and every 30 seconds while visible, and never block chart loading or execution.
Missing/failed estimates show an em dash, not zero. Sandbox labels explicitly
identify these as broker estimates because simulated margin rules can differ.

Reference: https://github.com/Kotak-Neo/kotak-neo-api-v2/blob/main/docs/Positions.md
