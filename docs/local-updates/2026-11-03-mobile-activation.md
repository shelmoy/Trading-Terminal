# Windows/private Android activation — 3 November 2026

Activated tested application `3f48a45e58f539a4380fa8253346fafe0c866003` on both
existing Windows instances after the user confirmed the existing FYERS app's
private callback was saved. This includes latest upstream through `f5805220b`,
the earlier Agent update, and the shared-login/dual-access mobile integration.
The native source remains in the separate private Trading-Terminal-Android repo.

The fresh cutover guard verified Analyze mode, no current-day browser login,
expired native broker tokens, no running strategy processes/configurations,
active workflows, working Analyze orders or positions. Only owned broker
processes were stopped. A stale/recycled launcher PID was correctly refused;
all six endpoints were independently confirmed stopped before installation.

Ten consistent SQLite backups and both original configurations were saved
privately before migration. Frozen dependency synchronization passed. The only
new schema is `mobile_login_tickets`, including the desktop/native return kind;
all pre-existing rows were verified unchanged. All 404 canonical production
assets match the tested temporary build, with previous compatibility chunks
retained. Unknown work and all chart, Renko, indicator, P&L/margin and execution
safeguards remain preserved. No broker credential or execution-mode change,
order, cancellation or position close was performed.

Both services restarted successfully. Desktop HTTP retains the existing
127.0.0.1:5000/5001 addresses, cookies and WebSocket configuration. The owned
Caddy proxy and private Tailscale Serve provide Kotak HTTPS443 and FYERS8443
on the configured laptop hostname; both origins proxy `/ws` to their broker.
No Funnel, exit node, router forwarding or public backend listener was added.
All six broker endpoints remain on loopback and owned by identified processes.

Trading, Scalper, CSRF and guest-auth refusal checks passed over desktop HTTP
and private HTTPS. The private session cookies are Secure/prefixed and remain
separate from desktop cookies. Both private TLS/WebSocket handshakes passed
without authenticating, subscribing or sending broker actions. The Windows
controller now displays both instances Ready: its null/mislabelled TCP-state
readiness filter was corrected conservatively while retaining process-ownership
and HTTP checks. The previous controller and proxy ownership records remain
in the private recovery directory.

The configured signed APK was delivered successfully through Tailscale to the
online OnePlus 12. SHA256:
`96bde1d327804f4015ada3828b1406a98162fbafcd80c6b9167d00d8fa64173d`.
It contains the private endpoints, not broker keys/passwords. Installation and
normal interactive login on the physical phone remain the acceptance step:
existing OpenAlgo credentials, Kotak TOTP/MPIN when needed, and FYERS Chrome
authorization returning to the APK. Fingerprint does not renew expired server
or broker sessions. No actual OAuth success, live-data device behavior or order
execution is claimed by these read-only server diagnostics.

Windows validation before rollout: 225 login tests, 33 frontend checks,
TypeScript/production build, eight fake proxy checks, and the final combined
upstream/mobile group of 326 tests passed (one existing Linux-only skip).
Recovery, migration, exact assets, HTTP/WSS and delivery records are private at
`C:/Users/ashut/.codex/backups/android-private-windows-20261103`.
