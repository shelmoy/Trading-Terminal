# FYERS linked-instance login repair — 25 October 2026

The primary broker selector reported FYERS as unconfigured when the OpenAlgo
app session was absent. Its configuration endpoint returned the configured
broker but omitted the linked-instance map in that state. Both local `.env`
files already contained the correct loopback routing configuration.

The endpoint now returns validated loopback destinations before app login,
while continuing to withhold the broker app ID. Selecting a different broker
uses that instance's native login route. Selecting the current broker with no
app identity returns to OpenAlgo sign-in. Missing/expired primary authentication
on FYERS now goes to primary `/login?broker=fyers`; successful app login or 2FA
resolves the requested broker through the server's allowlist and resumes at
`http://127.0.0.1:5001/auth/instance-login`. Invalid destinations fall back to
normal app navigation. Signed-cookie, expiry, session and TOTP checks are unchanged.

Verification: isolated Flask request contexts exercised the production routing
functions without importing app.py, opening broker connections or changing user
data. Checks passed for anonymous routing metadata, app-ID privacy, expired-login
destination and authenticated FYERS handoff. TypeScript/Vite production build
passed. Both local instances serve the same fresh index and entry script with
HTTP 200. Anonymous FYERS instance-login returned HTTP 302 to the primary login
with `broker=fyers`, as expected. Actual password/2FA and broker authorization
were left for the user's normal login.

No active Python strategy process/configuration, Flow workflow, Strategy Module
strategy or Chartink strategy was found in the read-only pre-restart inventory.
Restart performed during Sunday daytime, with no active regular market session.
The controller stopped each worker but reported an identity change for its
exiting Python launcher; a subsequent guarded Start restored both services to
Ready. No unidentified process was terminated. Existing strategy-book records
were preserved. Recovery branches `backup/before-fyers-routing-20261025` exist
in both instances, with old indexes in primary `tmp/fyers-routing-recovery-20261025`.

Complete fresh canonical build manifests are tracked; old hashed assets remain
locally available for already-open tabs. No credential, schema, dependency,
broker API, SDK or network configuration changes. Pending upstream Python
security/sandbox activation and broader performance acceptance remain separate.
