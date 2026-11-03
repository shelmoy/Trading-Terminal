# Private Android access to the existing Windows laptop

This is the selected hosting approach as of 3 November 2026. It supersedes the
Oracle/cloud provisioning and data-migration portions of `mobile-private-cloud.md`.
The Kotlin app stays in the separate private `Trading-Terminal-Android` GitHub
repository. This repository owns web/server changes and laptop integration.

## Prepared

- Official Tailscale 1.104.4 installed on Windows. The laptop and OnePlus 12 are
  signed in and private HTTPS is enabled. No exit node, subnet route or public
  Funnel was created.
- Caddy 2.11.7 Windows binary downloaded outside Git and verified against the
  official release SHA512 checksum. Configuration has no public listener and
  disables its admin listener and request access logs.
- `deploy/windows-private/render.py` generates two loopback reverse proxies,
  non-secret .env change proposals and the configured Android build property.
  It does not change live .env files or restart an app.
- `PrivateAccess.ps1` provides owned-proxy start/stop/status. It preserves existing
  unknown Serve configuration and never resets all Serve handlers. Private Serve
  terminates HTTPS on 443 (Kotak) and 8443 (FYERS); `/ws` goes to the corresponding
  broker WebSocket proxy. Flask receives its expected internal loopback Host.

## Activation sequence

1. Finish Tailscale sign-in on the laptop. Install official Tailscale on the
   OnePlus 12, using the same personal account. Enable private HTTPS/MagicDNS
   when Tailscale requests account consent. Choose a generic hostname: certificate
   names enter public certificate-transparency logs. Never share login codes here.
2. Read the actual `Self.DNSName` from `tailscale status --json`. Render a private
   configuration using that exact hostname and the two existing installation roots.
   Validate Caddy config before starting it. Inspect tailnet membership/access
   policy; grant interactive app access only to the owner's authorized devices.
3. Review broker callback registrations. The FYERS callback must be the laptop's
   private HTTPS `:8443/fyers/callback`, reachable by Chrome on the phone through
   Tailscale. The user approves broker-dashboard changes. The broker executes from
   the laptop's existing outbound internet connection; Tailscale is not an exit node
   and does not supply a new broker-whitelisted static egress IP.
4. Establish a safe restart window: inspect current broker sessions, strategies,
   orders and positions with read-only checks. Back up code, private configuration
   and databases consistently. Preserve unknown work. Apply the prepared tested
   web feature and additive native-ticket table only after these backups.
5. Apply the reviewed non-secret settings while preserving broker keys, passwords,
   encryption keys, cookie base names, account data and all customizations. Use
   `PRIVATE_ACCESS_MODE=dual`: the laptop keeps `http://127.0.0.1:5000` and
   `http://127.0.0.1:5001`, their existing cookies and WebSocket URLs. The phone
   uses private HTTPS with separate secure cookies. The owned loopback proxy
   sets a configured origin marker; the server verifies the loopback peer/Host
   and marker before selecting a private cookie. Shared app configuration is
   never mutated per request. Do not change desktop launcher links to HTTPS.
6. Start/verify only identified broker services, start the owned loopback proxy,
   then enable private Tailscale Serve. No router port forwarding or public backend,
   DB, ZMQ or WebSocket listener is needed. Do not use `tailscale funnel`.
7. Rebuild/sign the separate Android project with `-PterminalHost=<exact-host>`.
   Preserve the existing personal signing key. Install on the OnePlus 12 and verify
   fingerprint fallback, both logins, FYERS browser return, both live read-only feeds,
   watchlists, Renko, themes, rotation and network reconnection.

## One FYERS callback, both desktop and phone

FYERS uses one registered callback:
`https://msi.tailfee736.ts.net:8443/fyers/callback` on this laptop. A phone login
returns through its existing opaque native ticket. A login started on desktop
localhost records a bounded, session-bound desktop return ticket. The HTTPS
callback relays only that ticket back to the same configured local instance.
The desktop page removes it from the address bar and completes with the original
local session and CSRF token. It does not require another OpenAlgo sign-in and
never automatically retries an uncertain completion. The authorization code
stays encrypted server-side; a ticket stolen by another browser is unusable.

Keep the currently working web configuration until this compatibility change
and its matching assets are activated safely. The user changes only the existing
FYERS app's Redirect URL as the coordinated final provider step. API keys,
App ID, secret, static IP and execution mode stay unchanged. New app creation
or reactivation is not part of these instructions.

## Lifecycle and limitations

The laptop must stay powered on, awake and connected for phone access. Do not
change global sleep settings without the user's choice. The phone connects through
Tailscale on Wi-Fi or mobile data. App-localhost does not refer to the laptop.

After activation, integrate owned proxy startup into the existing server controller
and verify startup after laptop reboot. Keep the daily updater maintaining the
same Windows installations and preserving the private URL/proxy configuration;
there is no Oracle server or cloud migration to maintain.

No broker credential changes, trading actions, live-instance sandbox orders or
mode changes are diagnostic steps. The final dashboard callback save,
coordinated service activation and physical-phone acceptance are still required.

## Prepared validation, 3 November 2026

The generated JSON passed validation with the real Caddy Windows binary. Eight
fake-backend routing/origin checks passed without reaching either live server.
PowerShell parsing and three ownership cases (no handler, own handler, changed
foreign handler) passed. Tailscale reports `NeedsLogin`; no private hostname,
Serve exposure or live application activation was established at that checkpoint. No broker
configuration, database, service restart or execution mode has been changed.

Later on 3 November both laptop and OnePlus 12 joined Tailscale and HTTPS was
enabled. Dual cookie, local/secure primary SSO, desktop return, native return,
CSRF/origin isolation and duplicate-return mocks passed. The final login regression
run passed 225 tests with one existing Linux-only skip; 33 focused frontend checks
and the TypeScript/production build passed. Generated assets retain previous
compatibility chunks. The proxy overwrites a caller-supplied origin marker.
Resource review found short-lived database sessions on every return path and a
bounded 16-record, ten-minute ticket registry; no new worker, broker client or
streaming subscription is created by the desktop relay. Physical login acceptance
and the final provider callback save are still pending. Live Windows checkouts
remain untouched during preparation.

## User steps at the coordinated activation

1. Keep Tailscale connected on the laptop and phone. Leave the existing web
   addresses unchanged; no APK settings or API keys need entering.
2. Open the official FYERS API dashboard in a browser:
   https://fyers.in/web/api-dashboard/user-apps. Open the existing app used by
   OpenAlgo and edit its Redirect/Callback URL to
   `https://msi.tailfee736.ts.net:8443/fyers/callback`. Save/update the existing
   app. Do not create or reactivate an app or alter its App ID, key, secret or
   registered outbound IP. If editing is unavailable, stop at that screen rather
   than replacing the working app.
3. Report that the URL was saved. The maintainer then performs the backed-up,
   safe-window server/proxy activation and read-only checks. Until that deployment
   completes, a newly started FYERS login can fail because its old server setting
   and the new dashboard URL would differ; already-running sessions are separate.
4. Install the signed personal APK only from the delivered private file. Sign in
   to OpenAlgo with the existing username/password, then open each broker view.
   Existing valid broker connections are shared; expired connections require
   the broker's usual verification. Kotak uses its supported TOTP/MPIN form;
   FYERS opens Chrome and returns to the APK. Fingerprint unlock does not renew
   either server or broker sessions.
