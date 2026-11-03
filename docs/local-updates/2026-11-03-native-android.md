# Native Android chart surface - 3 November 2026

The replacement Android 0.2.0 candidate uses real Compose navigation, sign-in,
watchlists, books and touch Scalper selection. The chart engine remains SDK
2.6.9, rendered in a dedicated `/trading?android_chart=1` surface, selected only
for the Android user-agent on HTTPS. Normal desktop Trading is unchanged.
Both desktop localhost and Tailscale private HTTPS remain supported.

The surface loads the authenticated API key and exact private `/ws` origin,
locks interactions until the selected real instrument loads, removes a failed
default chart, preserves custom Renko registration, and starts One-Click off.
Only allowlisted interval/type/tools presentation messages are accepted; no
native order-execution bridge was added. Existing chart order dialogs and
preflight remain authoritative. Expanded chart tools retain indicator access.

Windows validation: 81 focused canvas/ChartPane/Renko tests, TypeScript and
temporary production build; Android 20 JVM tests, release lint/build and
signature verification. Resource review: abortable HTTP fetches, effect/event
cleanup and SDK disposal; native HTTP finally/stream-use, bounded response,
close-before-reconnect with connection generations and bounded retries,
Activity coroutine/feed/WebView teardown. Review is static plus mocked tests,
not a measured phone resource/latency result. No backend code, schema or pinned
dependency changes are required for this canvas update. Activation copies the
complete built assets with index last and preserves compatibility chunks.
Both services remain running; no restart/migration/order action is needed.

This is a device-validation candidate, not acceptance of untested physical
behavior. OnePlus installation, biometric fallback, broker login, FYERS Auth Tab
return, real quotes, both themes, keyboard/rotation and network changes still
need normal device use. FYERS authorization uses a secure Auth Tab (supported
Custom Tab fallback), not a promise that expired broker verification is
browser-free. Native order entry has not replaced the shared SDK ticket.

Recovery: private source/deployment snapshots at
`C:/Users/ashut/.codex/backups/android-native-ui-20261103`; the previous signed
APK and private signing key are retained. The cancelled old chart-trading
redesign remains cancelled; this change does not restore it. Preserve Scalper,
all Renko/custom indicators, Gaussian styling, history fixes, routing,
P&L/margin and Exit All safeguards.
