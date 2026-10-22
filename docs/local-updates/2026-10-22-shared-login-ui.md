# FYERS shared OpenAlgo login: frontend redirect repair

FYERS on port 5001 is configured to reuse the primary OpenAlgo account on port 5000. It deliberately does not accept a separate secondary password or copy the primary password hash/TOTP secret. Existing signed-cookie, session-age, active-session and two-factor checks remain authoritative.

## Cause and change

Client-side navigation to `/login` bypassed the Flask document-route guard and showed the ordinary password form in the secondary instance. The managed-login guard correctly refused that secondary password POST and returned a primary-instance URL. Passing that absolute URL to React Router produced a malformed path such as `/login/http://127.0.0.1:5000/profile`.

The Login page now checks the canonical `/login` document route using a same-origin fetch with manual redirect handling. A redirect response triggers full document navigation so the existing Flask managed-login guard can verify/import the primary session or return the browser to the primary account. Login responses pointing at server `/auth/` routes use full document navigation. Absolute or protocol-relative response targets are delegated to the fixed same-origin `/auth/instance-login` endpoint, rather than passed to React Router or followed as arbitrary external URLs.

No backend authentication checks, cookie names, passwords, broker keys, token records, TOTP configuration, expiry rules, public-hosting permissions or network exposure were changed. No server restart is needed for this frontend repair.

## User flow

1. Sign in to the existing OpenAlgo account at `http://127.0.0.1:5000/login` using its normal password and any enabled two-factor step.
2. Open `http://127.0.0.1:5001/login` in the same browser profile, or select FYERS from the primary broker selector.
3. OpenAlgo reuses the verified app login. Complete FYERS's own broker authorization if required.

An already open malformed 404 URL should be replaced with the correct `/login` URL. Refresh old browser tabs to load the new frontend.

## Validation and rollout

Read-only, cookie-free HTTP probes confirmed primary `/login` serves the normal form, FYERS `/login` redirects to `/auth/instance-login`, and an unauthenticated FYERS handoff returns to the configured primary `/broker`. Configuration checks confirmed different session-cookie names and an existing configured primary-login source without printing signing keys, broker credentials, passwords or tokens. No password submission, broker authorization, order or account mutation was used for these checks.

The frontend is built in a temporary directory, linted, and synchronized with its production assets to both broker installations and GitHub. Previous assets and the Git recovery branch `backup/before-shared-login-ui-2026-10-22` are retained. Prior hashed assets remain available locally for browser tabs already open during this market-session update. Servers remain running; no broker service stop/restart or database migration is performed. Build and anonymous HTTP checks do not establish a successful user-authenticated login; the final password/TOTP and broker authorization remain with the account owner.
