# Local broker selection with the existing OpenAlgo login

## Changes

- Added opt-in local broker-instance routing. Selecting a linked broker in `/broker` immediately opens its authentication flow.
- Linked the existing Kotak instance on port 5000 to the FYERS instance on port 5001 through private local environment settings.
- FYERS reuses the original signed app login, validates its age, daily rollover, active-session record and completed two-factor gate, and reads the original identity through a read-only SQLite connection.
- The secondary setup/password/reset/two-factor configuration routes are disabled; the existing OpenAlgo credentials remain authoritative. No password hash or TOTP secret is copied.
- Broker tokens, data, API keys, session cookies and ports remain separate. The original broker connection is retained when opening the other instance.
- FYERS OAuth now uses server-generated state with callback matching and a five-minute window. A broker callback for another instance is rejected before it can alter the current session's broker.

## Activation and recovery

- Recovery branch: `backup/before-broker-handoff-2026-10-19`.
- Each instance's environment and consistent SQLite account snapshot were saved under its ignored `db/backups/2026-10-19-before-shared-broker-login/` folder before configuration changes.
- Production TypeScript/Vite build completed; Python modules compiled. The existing large-chunk warning remains.
- This local shared-login feature supports explicitly configured loopback instances with a SQLite primary database. It is not enabled for public hosting.
- The browser's broker authorization and OTP still belong to the account owner. Compilation and service availability do not establish successful FYERS account authorization.
- No automated tests or trading actions were run. Private environment, broker credentials, databases, logs and compressed runtime build files are excluded from GitHub.
