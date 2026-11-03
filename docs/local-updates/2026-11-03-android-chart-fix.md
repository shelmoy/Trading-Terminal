# Android chart loading and mobile layout - 3 November 2026

The 0.2.0 native Android candidate was reported blank on FYERS and too crowded.
The 0.2.1/code3 replacement keys the mounted AndroidView by broker identity:
changing a remembered WebView alone does not rerun AndroidView.factory. Both
retained broker views now mount under the matching key with explicit bounds.
Read-only chart reload uses a new request tag and document URL. Approved-origin
loading/error/ready signals are bound to that request; TLS/HTTP/load failures
and slow initialization have a visible message and explicit reload. SDK init
errors unmount the failed chart and can be retried rather than leaving a blank
surface. No certificate bypass, automatic mutation retry or native order bridge.

Charts have one compact control row and a focus toggle hiding app navigation;
landscape opens focus automatically and Back exits it. The native selector
reflects the SDK-accepted timeframe/type, including Renko 4 seed restrictions.
Scalper uses compact underlying/expiry/strike selectors, hidden during focus.
Markets uses flat instrument/price/change rows, on-demand search and only
necessary pagination. Funds/P&L move to Portfolio. Broker switching and less
frequent actions use menus; custom line navigation glyphs replace text symbols.

Daily previous close is retained per instrument/session. REST/stream close-field
variants are accepted and later LTP-only/depth updates cannot erase a known
SENSEX daily percentage or refresh an old price timestamp. Missing references
stay unavailable; a zero placeholder is not invented no-change data.

Windows checks: 27 Android JVM tests, 83 focused web/ChartPane/Renko tests,
TypeScript, release lint/signature and temporary production build. Eight real
SDK Chrome fixtures cover both brokers/themes and portrait/landscape with all
HTTP/WebSockets intercepted using fake data, and reject mutation paths. Canvas
bounds and screenshots were inspected. These are browser/transport checks,
not physical OnePlus validation or actual FYERS session verification. Provider
401/session failures still require the normal user broker connection flow.
No diagnostic order, cancellation, close or execution-mode change was made.

Resource review: fetch timeout/abort cleanup, native coroutine cancellation,
request-scoped callbacks and retained view ownership; only two broker views and
bounded status maps remain. Chart SDK 2.6.9 and all custom Renko/indicators,
Gaussian styling, history fixes and existing execution safeguards are unchanged.
The desktop path remains unchanged. Deployment is frontend-only: complete exact
canonical assets first, index last, compatibility chunks preserved; no backend
restart, environment/schema/network change or migration is needed.

The Android source remains in its separate private repository. Candidate 0.2.1
uses the original signing key for in-place upgrade. Private recovery, test logs,
screenshots and delivery/acceptance handoff are under
`C:/Users/ashut/.codex/backups/android-chart-fix-20261103`.
