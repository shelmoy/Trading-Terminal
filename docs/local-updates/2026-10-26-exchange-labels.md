# Compact exchange labels — 26 October 2026

Trading and Scalper now display NSE and BSE for index exchange tags. This covers
saved watchlists, broker watchlist catalogs, chart toolbar and OHLC legend
(including screenshot text), search results, instrument pickers, quote headers
and Scalper pane headers. Other exchange labels retain their existing values.

Inline Snapshot / Limit snapshot text has been removed from both watchlist
layouts so it no longer crowds the instrument name. Hover details retain
source, streaming-limit and receipt-time information. A missing quote is still
described as waiting for a fresh quote; no cached quote is relabelled live.

The formatter is only used at presentation boundaries. NSE_INDEX/BSE_INDEX
remain unchanged in API requests, subscriptions, routing keys, instrument
selection, segment filters, saved watchlists and quote-only safeguards.
Price calculations, chart data, broker execution and the SDK are unchanged.

Production TypeScript/Vite build passed in a temporary output directory.
94 existing tests passed across saved watchlists, chart panes, symbol search
and legend rendering. The saved-list test fixture explicitly selects its
intended My lists tab and uses a missing previous close for its fallback case;
production pricing/history logic was not changed. Existing dialog-description
and bundle-size/reference warnings remain.

Both instances receive identical source and complete built assets, published
with index last and older hashed chunks retained for already-open pages.
No backend restart, dependency installation, migration, trading action,
credential or mode change is needed. Recovery branches
backup/before-exchange-labels-20261026 and the prepared suffix are retained.
The separate upstream security activation remains pending.

Refresh Trading/Scalper in each broker tab to load the new labels. Hover a
watchlist row for quote freshness details.
