# Futures search expiry ordering

The Trading search screenshot contained `CRUDEOIL19OCT26FUT` in seventh place. It sorted day-first contract names alphabetically, placing December 2027 ahead of October 2026.

The Trading symbol-search dialog now orders dated Indian futures by underlying and actual expiry date after the existing exact-match, segment, relevance and exchange rules. Unexpired contracts come first, including contracts expiring today. Older contracts follow, most recent first. Explicit exact-symbol searches retain first priority. The selection still uses the original broker-mapped symbol and exchange.

The FYERS public master and both local symbol databases contain the 19 October contract. Read-only FYERS-instance requests returned:

- Search: `CRUDE OIL 19 OCT` found the standard and mini contracts.
- Exact search: `CRUDEOIL19OCT26FUT` returned the MCX futures contract.
- Quote: successful response.
- History: successful response with 704 one-minute candles for 19 October 2026 at the time of investigation.

No trading action or database modification was used. The frontend change applies to both the original and FYERS instances. Production TypeScript/Vite compilation is used for the updated build; no automated tests were added or run.
