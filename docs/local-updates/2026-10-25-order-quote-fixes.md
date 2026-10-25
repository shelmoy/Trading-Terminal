# Broker acknowledgement and quote isolation fixes — 25 October 2026

The four issues reproduced in the private trading verification report have been
repaired for both FYERS and Kotak. Order submission continues through the
installed chart SDK and the existing native broker adapters.

- The live placement service requires HTTP success, a nonempty broker order ID,
  and no explicit broker rejection before returning success or publishing an
  OrderPlacedEvent. Broker RMS rejection text is retained. Missing IDs, transport
  failures and malformed outcomes cannot publish order success. A timeout or
  unavailable response may follow delivery, so the response directs the trader
  to check the order book before retrying. Placement is never automatically
  retried by this change.
- Ticket quotes are scoped to broker/account/login, API key, symbol and exchange.
  Previous-scope values are excluded immediately; obsolete quote/depth requests
  are cancelled and their callbacks ignored. At most one fallback request batch
  runs per hook at a time. A REST request started before a newer WS tick cannot
  overwrite that tick. Expired/disconnected WS data is excluded from both price
  and depth, and freshness expires on a timer even when ticks stop.
- Chart order events and REST orders require matching symbol **and exchange**.
  Old book responses are discarded after instrument/chart/feed changes or a
  newer broker event. A late working-order snapshot cannot resurrect an order
  already completed by a push event. Live and Analyze events stay in their
  corresponding panes.
- Position exit acknowledgements now say "exit order accepted" with the broker
  order ID. A filled/closed state is not inferred from placement acceptance.

## Verification

Nineteen isolated backend acknowledgement cases passed, with broker calls and
events mocked. The production functions are extracted without importing the
application, databases or adapters. Tests cover HTTP-200 rejections, rejection
with a misleading ID, missing IDs, missing response, HTTP errors, valid IDs,
event emission and uncertain Kotak transport errors. Each placement path is
invoked once; no real or sandbox orders are submitted.

One hundred five frontend tests passed across live quotes, order tickets,
instrument/exchange matching, order events, terminal behavior, replay locks and
market-data fallback ordering. Existing lifecycle test doubles were updated to
include current instance members; old visibility assertions now protect the
requested always-live main feed. No application behavior was weakened to make
those fixtures pass. Total targeted cases: **124 passed**.

An additional 16 BUY/SELL mapper combinations were checked with real FYERS and
Kotak mapping functions and fake HTTP clients. Production TypeScript and Vite
builds passed; SDK remains 2.6.7. Existing large-chunk/reference warnings remain.
The optional formatter was blocked by pre-existing nested Biome configuration;
its configuration was not changed.

Resource review: one request batch/controller and one blocked prior map per
hook; no growing registry. Both polling and freshness timers are cleaned up.
Requests are aborted and generations invalidated on scope change and unmount.
The prior WS map is released when a new map arrives. Backend acknowledgement
validation adds no clients, databases, threads or retry loops. Review was static
plus cancellation/single-flight lifecycle tests, not a sustained memory profile.

## Deployment and limits

Changes and complete canonical production assets were deployed to both local
instances and GitHub. Recovery branches `backup/before-order-quote-fixes-20261025`
and old indexes in primary `tmp/order-quote-recovery-20261025` are retained. Old
hashed assets remain locally available for already-open pages. No dependency,
schema, credential, network exposure or trading-mode changes were made.

Service restarts were performed on Sunday after a read-only inventory found no
active Python strategy process/configuration, Strategy Module strategy, Flow
workflow, Chartink strategy or scheduled job. Historical strategy-book records
were preserved. Both services were restored with the guarded controller.

Read-only runtime checks returned HTTP 200 on both ports and the new entry
script. Both proxies authenticated and admitted order-update subscriptions;
diagnostic sockets/subscriptions were closed. FYERS' direct live orderbook
returned success. Kotak returned its empty-book response `5203 / No Data`.
Both installations remain **Analyze mode**; local order/position book reads
therefore describe that ledger, not live execution.

The observed REST quote median after the first activation was about 102 ms
for Kotak and 826 ms for FYERS, including network, processing and Standard data
pacing. This is not order-execution latency or WS-to-screen timing. Real BUY/SELL
broker acceptance, actual fills/slippage, sustained live-market streaming and
render p50/p95 remain unmeasured. No zero-delay or identical-to-website execution
guarantee is made. The separate pending upstream security/sandbox activation
and broader watchlist performance acceptance remain tracked independently.
