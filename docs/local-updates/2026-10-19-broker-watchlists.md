# Broker commodity and index watchlists

The shared Trading/Scalper watchlist now opens with a built-in Commodities tab.
My lists retains the user's existing saved watchlists; Indices provides broker
index spot instruments and their matching futures where available.

## Behavior

- Read-only `/watchlist/api/broker-catalog`, guarded by the existing signed-in
  broker session, reads this instance's downloaded broker symbol master.
- MCX futures are grouped by underlying, including MCXBULLDEX and MCXMETLDEX.
  Expiries use actual broker master dates in ascending order. The initial
  selection is the nearest unexpired contract; expiry-day contracts remain
  selectable until the IST date changes.
- NSE/BSE indices are listed from each broker's master. NFO/BFO futures join
  only to exact matching index underlyings. Spot indices explicitly have no
  expiry; index futures show their expiry dates.
- Clicking a name loads its chart. Selecting an expiry both updates that row
  and loads the selected contract. Selections are independent per underlying
  and broker and remembered in this browser. Once a selected expiry leaves
  the unexpired catalog, that row falls back to its nearest valid contract.
- Catalog metadata refreshes on reopening, returning to the browser tab,
  manually using Refresh, and every five minutes while visible. It reads
  the latest locally downloaded broker master, not an external broker call
  on each view. Existing broker master download routines supply new listings.
- Prices reuse the existing shared market-data hook. Only the current page
  (at most 40 instruments, one selected contract per row) requests quotes;
  alternate expiries and hidden saved lists are not subscribed. REST snapshots
  refresh every 60 seconds and pause when the tab is hidden. There is no
  automatic chart-history prefetch for the whole commodity catalog.
- A dash means no broker price received. Listing a contract does not imply
  a market-data entitlement or permission to trade it, including Kotak MCX.

## Installation and checks

Applied to the Kotak instance on 5000 and FYERS instance on 5001, preserving
each instance's credentials, cookies, broker databases and saved lists.
No database migration or watchlist overwrite is required.

Read-only catalog inspection found 31 commodity groups / 175 unexpired
commodity contracts in the Kotak master, including CRUDEOIL19OCT26FUT.
Both instances' master files include the commodity groups. Index coverage
differs by broker and is not copied between instances.

TypeScript/Vite production build and focused frontend lint completed.
No automated tests were added or run. Existing large-chunk build warnings
remain. Service activation requires a brief restart; local configuration and
account database backups are retained outside Git before activation.

Refresh the Trading or Scalper browser tab and open Watchlist, then select
Commodities or Indices. Use My lists for previous saved lists.
