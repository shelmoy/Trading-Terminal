# Trading Terminal Android / private-cloud rollout

Status: implementation checkpoint, **not activated or accepted on a phone**.
Branch `feat/android-private-cloud-20261102` starts at `fd12560d6`, the tested
prepared maintenance head. Live Windows instances remain at `186595980`.
The cancelled chart-trading redesign is not part of this work.

## Implemented

- Android Kotlin/Compose shell: API 37, minimum 34, two retained WebViews,
  native broker selector, biometric/device credential gate, cold-start lock,
  60-second background timeout, private-origin navigation and messages,
  Custom Tab FYERS login, certificate refusal, app-data backup exclusion.
- Original Trading/Scalper UI and execution APIs. Portrait Scalper pane selector,
  mobile layout/quantity/One-Click keys, explicit chart-settings transfer in
  Profile. No SDK patches; chart SDK stays 2.6.9.
- Opt-in `PUBLIC_ORIGIN` / `BROKER_PUBLIC_ORIGINS`; loopback `HOST_SERVER` and
  signed-cookie identity authority remain internal. Secure cookie prefixes use
  public HTTPS. Explicit origin checks protect cloud cookie mutations.
- `/mobile/bootstrap`, CSRF-protected FYERS start/cancel/completion. Callback
  stays `/fyers/callback`. Chrome receives an opaque ticket, never the auth code.
  One-use tickets are bound to the initiating WebView's login nonce, account,
  sign-in time and session. Codes are encrypted with the existing server key.
  Normal callback staging, revocation and final token-commit checks are reused.
- Additive `mobile_login_tickets` table uses the broker-key metadata startup
  path. Maximum 16 pending records, ten-minute expiry, one-use atomic claims,
  short-lived SQLAlchemy sessions closed on all paths. Back up before startup
  against a real deployment. No migration has run on either live database.
- `deploy/private-cloud/render.py` produces server-side JSON settings, systemd
  units, loopback nginx proxies and Tailscale Serve commands from an exact
  private MagicDNS host. It does not provision, copy credentials or start services.

## Native build on Windows

Native tools live outside Git at
`C:\Users\ashut\.codex\runtimes\android-windows-20261102`.
JDK 17.0.21, Gradle 9.5.0, AGP 9.3.3, Kotlin/Compose compiler 2.2.10.
The stable SDK package is named `platforms;android-37.0` in Google's repository;
Gradle compileSdk/targetSdk are 37. No emulator/system image is installed.

Set JAVA_HOME and ANDROID_HOME to these native Windows tools. Build with
`mobile/android/gradlew.bat :app:testDebugUnitTest :app:lintRelease :app:assembleRelease`.
The Gradle property `terminalHost` pins the exact `.ts.net` server hostname.
Without that property, the build displays **Cloud setup pending** and cannot
navigate or connect to a broker. This unconfigured build is for installation
checks only, not trading acceptance.

Release signing uses environment variables `TERMINAL_KEYSTORE` and
`TERMINAL_STORE_PASSWORD`. The personal key and recovery information stay in
`C:\Users\ashut\.codex\keys\trading-terminal-android`, outside Git. Keep an
encrypted offline backup of this folder: future APK updates require that key.
No operator secrets, payment details, passwords, MPIN or TOTP seeds enter the APK.

## Account / provisioning gate

The user asked for assistance creating Oracle and Tailscale accounts later.
No accounts or resources have been created. They must enter identity/card/OTP
and consent on the official provider sites, never chat or source files.

1. Oracle Free Tier: Mumbai home region, Always Free eligible ARM A1 allowance
   verified in the actual account (planned 2 OCPU / 12 GB). Verify persistent
   storage, a stable outbound IP and the entire resource estimate are ₹0 before
   provisioning. Stop if unavailable; no paid upgrade/fallback.
2. Join only authorized phone, laptop and cloud node to the personal tailnet.
   Choose a generic node name. Tailnet HTTPS certificate names enter public CT
   logs. Do not put account identifiers in node names.
3. Provision separate private source/data/env roots `/srv/trading/kotak` and
   `/srv/trading/fyers`, owned by a non-root `trading` user. Install locked
   production dependencies and use the existing gunicorn launcher with one
   worker per instance. This is a cloud Linux server, not a laptop VM or test suite.
4. Generate config using `python deploy/private-cloud/render.py --host <exact-host>
   --output <private-output-dir>`. Merge settings into each private .env while
   retaining the correct per-instance encryption keys. Ensure primary .env is
   readable by FYERS's same trusted OS user. Public backend/DB/ZMQ ports must
   have no ingress rule. Nginx listens only on 127.0.0.1:15000/15001. Tailscale
   Serve terminates HTTPS 443/8443; `/ws` goes to 8765/8766. Never use Funnel.

## Migration and safe cutover (pending)

Do not copy running SQLite files with a filesystem copy. Establish an idle
window, stop the identified local instances, and use SQLite backup for each
database plus integrity checks. Preserve the untouched Windows recovery set.
Transfer privately encrypted snapshots and required encryption configuration.
On **cloud copies only**, invalidate copied broker tokens and browser sessions,
clear pending login state and reconcile scheduler/strategy enablement before
startup. Never start local and cloud strategy engines together.

Migration/sanitization automation and encrypted off-instance backup/restore
rehearsal are still pending; do not treat the templates as a migration tool.
Use verified free persistent Object Storage for encrypted backups, with bounded
retention and recovery keys retained on Windows, after checking account quotas.

The user approves official broker dashboard callback and static-IP changes.
Kotak cloud callback ends `/kotak/callback`; FYERS ends `/fyers/callback`.
Normal user broker login must create fresh cloud sessions. No copied IP-bound
token may be used to enable cloud order access.

## Acceptance and maintenance

Focused Windows mocks/browser checks replace the contributor Linux suite by
explicit user direction. No real or live-instance sandbox orders, cancels,
position closes or execution-mode changes are diagnostic steps.

Remaining acceptance: physical OnePlus 12 installation/biometrics/rotation/
keyboard/full-screen; browser-to-app return and cancel; both user broker logins;
read-only quote/watchlist/Renko checks; Wi-Fi/mobile and Tailscale interruption;
process death; exact private exposure; fixed outbound IP after reboot; backup
restore. Native unit tests do not establish these device/provider behaviors.

After acceptance, rebuild/sign with the real host, publish matching canonical web
assets with compatibility chunks, safely cut over, and update the existing daily
maintenance automation to the actual cloud node. Until then it continues to
maintain Windows; do not point an automation at a server that does not exist.
Public third-party webhooks remain inaccessible through private-only hosting.

## Checkpoint evidence

Windows auth regression run: 217 passed, one pre-existing Linux-only skip.
Expanded mobile tests: 16 passed (including logout during Chrome auth and
loopback/public-origin isolation). Frontend: 38 passed; TypeScript passed.
Android initial debug build and four native unit tests passed; initial signed
release and lint passed (zero errors, version-pinning advisories).
Latest build/asset and signing verification are recorded in the private handoff
under `C:\Users\ashut\.codex\backups\android-private-cloud-20261102`.
Baseline pytest shutdown logger emits a closed-stream warning after success.

No cloud provision, phone verification, live source activation, live migration,
restart, broker dashboard change or order action has occurred in this feature.
