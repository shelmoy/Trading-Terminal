# Private Android access to the existing Windows laptop

This is the selected hosting approach as of 3 November 2026. It supersedes the
Oracle/cloud provisioning and data-migration portions of `mobile-private-cloud.md`.
The Kotlin app stays in the separate private `Trading-Terminal-Android` GitHub
repository. This repository owns web/server changes and laptop integration.

## Prepared

- Official Tailscale 1.104.4 installed on Windows. User authentication is needed;
  no Tailscale account, exit node, subnet route or public Funnel was created.
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
   encryption keys, cookie base names, account data and all customizations. Both
   phone and laptop will use the private HTTPS URLs after activation. Secure cookie
   prefixes require a fresh browser login; the old localhost HTTP bookmarks are
   not the supported active login route in this configuration. Update the desktop
   server controller's browser links to the private URLs at the same cutover.
6. Start/verify only identified broker services, start the owned loopback proxy,
   then enable private Tailscale Serve. No router port forwarding or public backend,
   DB, ZMQ or WebSocket listener is needed. Do not use `tailscale funnel`.
7. Rebuild/sign the separate Android project with `-PterminalHost=<exact-host>`.
   Preserve the existing personal signing key. Install on the OnePlus 12 and verify
   fingerprint fallback, both logins, FYERS browser return, both live read-only feeds,
   watchlists, Renko, themes, rotation and network reconnection.

## Lifecycle and limitations

The laptop must stay powered on, awake and connected for phone access. Do not
change global sleep settings without the user's choice. The phone connects through
Tailscale on Wi-Fi or mobile data. App-localhost does not refer to the laptop.

After activation, integrate owned proxy startup into the existing server controller
and verify startup after laptop reboot. Keep the daily updater maintaining the
same Windows installations and preserving the private URL/proxy configuration;
there is no Oracle server or cloud migration to maintain.

No broker credential changes, trading actions, live-instance sandbox orders or
mode changes are diagnostic steps. Account signup/sign-in, final hostname,
dashboard callback consent and physical-phone acceptance are still required.

## Prepared validation, 3 November 2026

The generated JSON passed validation with the real Caddy Windows binary. Eight
fake-backend routing/origin checks passed without reaching either live server.
PowerShell parsing and three ownership cases (no handler, own handler, changed
foreign handler) passed. Tailscale reports `NeedsLogin`; no private hostname,
Serve exposure or live application activation has been established. No broker
configuration, database, service restart or execution mode has been changed.
