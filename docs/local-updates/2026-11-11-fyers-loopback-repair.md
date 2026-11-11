# FYERS desktop login repair, 11 November 2026

The FYERS authorization endpoint returned `invalid clientId` with the value
saved as the local App ID. The existing FYERS API app had already been updated
to use the loopback callback on port 5001. The saved App ID from the private
recovery copy reached the FYERS sign-in page with that exact callback.

The local FYERS configuration now uses the previous saved App ID and secret
with `http://127.0.0.1:5001/fyers/callback`. The two credential fields were
restored together after a private configuration backup. OpenAlgo reads them
for each fresh login, so neither running service needed a restart. Completion
of the user's fresh OTP sign-in remains to be verified.

The repository validates the full FYERS App ID at save and login start. A
malformed value produces a local message before any broker redirect. A
localhost callback uses the existing desktop login session. The configured
private HTTPS callback retains its desktop relay, including the original
state, CSRF and revocation protections.

Windows validation passed 215 isolated authentication tests, including the
malformed ID and both callback routes. One existing Linux-only file permission
test was skipped on Windows. Eight HTTP checks passed against the two running
web instances. The patch changes backend login code only and retains the
verified SDK 2.7.0 build from the previous maintenance commit. Local activation
of the repository patch and that build remains pending a safe window.

[FYERS API authentication documentation](https://fyers.in/api-docs/v3/api/authentication/individual-app/validate-auth-code)
