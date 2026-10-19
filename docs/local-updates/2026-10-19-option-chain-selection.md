# Option-chain identity, expiry and price-reference repair

The Trading screenshot showed CRUDEOIL options for 17 November as an empty
chain. The server was building strikes, but the live hook rejected the
response because its price reference was a full futures symbol rather than
the requested underlying name. Other selection defects affected index roots
and prices for expiries beyond the nearest expiry.

## Changes

- The live hook validates its immutable polling request identity (underlying,
  derivative segment and option expiry). It no longer compares the request
  name with the backend's distinct tradable price-reference symbol. Existing
  request-generation and WebSocket-session guards remain.
- Active charts map only to exact roots listed in the broker's option catalog.
  Contract suffix parsing preserves digits in NIFTYNXT50, SENSEX50 and
  SILVER100. BFO stocks/indices no longer automatically become SENSEX, and
  NFO stocks/indices no longer automatically become NIFTY. A chart with no
  broker-listed options gets an explicit explanation and manual selector.
- Segment catalog loading cannot overwrite the chosen chart with an arbitrary
  first/default underlying. Empty expiry responses clear obsolete expiries.
- MCX/currency option pricing selects the first live futures contract whose
  expiry covers the selected option expiry. CRUDEOIL 17NOV26 options therefore
  reference CRUDEOIL19NOV26FUT, rather than the expiring October future.
- NSE/BSE references are resolved from actual broker index/cash mappings.
  Where the broker has index options but no spot mapping, a matching listed
  futures reference is used. The response carries its exact symbol/exchange.
- Explicit option expiry takes priority over any expiry embedded in a futures
  input. The shared underlying parser now supports numeric index roots.
- FYERS native chain requests resolve the selected expiry through the broker's
  expiryData identifier instead of silently requesting the nearest expiry.
  Returned leg broker symbols must match the exact selected contracts before
  their prices/OI are attached. Missing legs use exact-symbol bulk snapshots;
  they are not substituted from another month. Snapshot fallback avoids the
  per-leg OI request fan-out responsible for earlier Standard-plan throttling.

Native OI is retained when supplied for matching contracts. Snapshot-only
fallback cannot provide OI and the existing display renders it unavailable.
No options are invented for indices absent from a broker's option master.

## Scope and installation

The shared panel/live hook applies to Trading and Scalper in the Kotak (5000)
and FYERS (5001) instances. Broker credentials, saved watchlists, custom
indicators and order controls are preserved. Private backups and a Git backup
branch are retained before service activation; no account data is committed.

TypeScript/Vite compilation and focused frontend/Python lint completed. No
automated tests were added or run. Existing large-chunk build warnings and
unrelated pre-existing FYERS exception-style lint findings remain. Backend
activation requires a brief service restart; refresh the browser afterward.

Official FYERS expiry selection reference:
[Option Chain](https://fyers.in/api-docs/ai/skills/option-chain/).
