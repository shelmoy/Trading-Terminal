# External market data staging

Downloaded on 2026-10-06 from Dhan's public scrip master:

- `dhan-scrip-master.csv`: original public instrument catalogue.
- `mcx-contracts.csv`: OpenAlgo-normalized MCX futures and options.
- `equity-fno-contracts.csv`: OpenAlgo-normalized NFO and BFO futures and options.
- `market-indices.csv`: OpenAlgo-normalized NSE and BSE indices.
- `manifest.json`: row counts and source metadata.

These files contain instrument identifiers and contract metadata. They do not contain live prices or OHLC history.

Do not copy Dhan security IDs into the active Kotak `symtoken` table. Security IDs are provider-specific and doing so would break Kotak quote and order routing.

## Price data requirement

The existing `broker/dhan` adapter supports `MCX_COMM`, live WebSocket ticks, quotes, daily candles, and 1/5/15/25/60-minute candles. It requires:

1. A Dhan client ID.
2. A current Dhan access token.
3. An active Dhan Data API subscription.

Once those are configured, download history into Historify so Sandbox and chart requests read from the local DuckDB cache.
