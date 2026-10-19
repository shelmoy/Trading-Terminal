# One OpenAlgo login for local broker instances

Local installations can keep one OpenAlgo username, password and two-factor setup while opening separate broker instances from the broker selector. This is opt-in; ordinary installations retain the existing login flow.

## Configuration

Each instance still requires its own broker App ID/secret, callback, databases, web/WebSocket/ZMQ ports, app encryption keys and unique session/CSRF cookie names. Never use a shared broker database or replace one broker's credentials to switch to the other.

Set the same mapping in both local `.env` files:

```dotenv
BROKER_INSTANCES='{"kotak":"http://127.0.0.1:5000","fyers":"http://127.0.0.1:5001"}'
```

Leave `BROKER_LOGIN_SOURCE_ENV` empty in the original instance. In the secondary instance, set it to the absolute path of the original `.env` file. Restart both after changing their environment.

Use both apps in the same browser profile and the exact `127.0.0.1` host. Browser cookies do not distinguish ports. The secondary verifies the primary cookie's signature and age, checks the daily rollover and the original active-session record, then reads only the matching user identity from the primary SQLite database in read-only mode. Pending two-factor sessions cannot be imported.

The secondary creates a local identity row and its own API key for broker tables. Its unknown random password is never exposed or used; secondary password login, setup, password reset and two-factor configuration routes are disabled. Manage those credentials through the original instance. Password hashes and TOTP secrets are not copied. Broker tokens and trading/API keys stay separate.

## Usage

1. Sign in to the original OpenAlgo account.
2. Open `/broker` and select a linked broker such as FYERS.
3. OpenAlgo carries the app login to the selected local instance and redirects to that broker's login. Complete the broker's own authentication/OTP yourself.
4. An already connected target instance opens its dashboard. The original broker connection is retained.

FYERS login starts at `/auth/fyers/start`. A cryptographic state value is bound to the local session and must match the callback within five minutes.

## Scope and security

This feature is restricted to explicitly configured `127.0.0.1` origins and local requests, with SQLite as the original identity database. It is **not** a public-hosting SSO service. Both installations and other applications running as that OS account must be trusted: the secondary has read access to the original signing configuration. Keep `.env` files private and excluded from Git.

Logging out of an instance ends that instance's session; it does not implement global logout across both broker instances. A revoked original session cannot establish a new secondary login. A secondary broker session already established has its own expiry and revocation controls.

If the original browser session is absent or expired, return to the original broker/login page. No unauthenticated username parameter or unverified cookie can create a broker identity.
