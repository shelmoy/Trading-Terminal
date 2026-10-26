# NIFTY Renko history dates — 26 October 2026

The FYERS screenshot showed July NIFTY prices joined to October prices. This
created a misleading Renko fall and July axis labels while SENSEX looked recent.
Direct FYERS read-only history for NIFTY returned correct October timestamps.
The local API also reproduced a range violation: a request for 23–26 October
returned SENSEX candles starting on 19 October.

Two cache boundaries allowed this:

- The server's latest-window reuse condition allowed a later requested end
  date to reuse an earlier cached end, and returned the whole cached response.
- Browser warm-history reads checked the upper time limit but not the lower
  bound; a recently written cache timestamp could keep much older bars usable.

Server cache reuse now requires full date coverage and slices all cached and
fresh broker responses to the requested inclusive IST dates. A wholly
out-of-range cache is a miss, not a false empty result. Browser REST and cache
boundaries also exclude bars outside the requested window. No timestamps or
OHLC are invented, and deliberately paging to older dates remains supported.

The history-preview key moves to openalgo.scalper.fastCache.v2; server disk
history moves to db/fast_history_cache_v2.pkl (ignored by Git). Old cache files
and keys remain recoverable. Renko brick settings, indicator preferences,
drawings, native chart SDK2.6.7 and broker/order configuration are unchanged.
The shared frontend guard applies to Trading and Scalper on both instances.

Verification: 42 targeted frontend tests across six files and eight isolated
backend history-cache tests passed. Cases include the actual SDK Renko
transform on a mixed July/October series, Monday source timestamps after
Friday, retained historical paging, exact/contained/stale cache windows,
future bars and IST midnight boundaries. TypeScript and production Vite build
passed in a temporary directory; existing bundle/reference warnings remain.

The broader terminalHistory suite has 55 passing and 19 failing tests both
with this change and on the unchanged HEAD baseline. That baseline was run
with identical dependencies and the modified tracked sources were restored
byte-for-byte from a recovery snapshot afterwards. Those failures remain
unresolved; a full-suite all-clear is not claimed. No order tests or real or
sandbox trading actions were used for this repair.

The browser-inspection tool ended because it could not confidently verify
Chrome's current URL. No further UI inputs were sent. Verification instead
uses isolated regressions, production compilation, served-asset checks and
read-only local/direct broker history comparisons.

Recovery branches backup/before-renko-history-20261026 and prepared suffix
are retained. FYERS activation is gated on a fresh Analyze-mode check,
successful direct broker reads with zero working orders/open positions and
no active strategies/jobs. Only FYERS is restarted for this request; Kotak's
backend cache change takes effect on its next normal safe restart. The complete
frontend build is published to both, index last with old chunks retained.
No migrations, dependency installations, credential/mode changes or broad
pending upstream security activation are part of this update.

Refresh the FYERS Trading tab to load the repaired history-cache format.

## Live index feed follow-up

A read-only proxy sample also reproduced a separate live-feed defect: both
subscriptions were accepted, but only SENSEX delivered ticks. FYERS' official
fyers-apiv3 3.2.0 decoder reads an index snapshot trailer (reserved bytes,
multiplier, precision and three length-prefixed strings). The local decoder
stopped before this trailer, mistaking its first zero byte for the next record
type. Only the first index in a batched snapshot became registered; reversing
the frame order reproduced the missing opposite index.

The decoder now consumes the whole index record and rejects truncated frames
without publishing partial index state. Five isolated binary tests reproduce
the old failure in both snapshot orders, exercise subsequent NIFTY/SENSEX
updates and check three truncated packets. All five pass after the repair;
eight history cache tests also remain passing. A direct read-only eight-second
feed sample using the repaired decoder received 34 NIFTY and 15 SENSEX updates.
The fix does not alter broker subscription limits or order APIs. No new
frontend build is needed for this backend follow-up; the successful production
build and canonical assets in the preceding commit still match the frontend.
