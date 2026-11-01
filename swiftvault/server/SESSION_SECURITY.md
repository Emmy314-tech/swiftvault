# Authentication sessions

Successful login and phone verification create a server-side `AuthSession` and
issue a JWT containing that session ID and the user's `authTokenVersion`.
Protected routes require the JWT version to match the user record and the
referenced session to remain unexpired and unrevoked. Logout revokes the current
session. Password recovery revokes active sessions and increments the token
version. The internal phone-update handler does the same, but no phone-update
API route is currently enabled.

The server creates the session collection's unique token ID, user lookup, and
expiry indexes at startup. Existing JWTs do not contain a session ID and are
intentionally rejected after this change; users must sign in again. Outstanding
phone-verification or recovery codes issued before `phoneOTPPurpose` was stored
must be resent before they can be used.

Session records expire after their JWT's 30-day lifetime. MongoDB must support
the configured TTL index. Do not copy production session records into test
environments or run production migrations as part of local verification.

Authenticated session metadata includes the last-used timestamp and
IP/user-agent values for device management. The values are risk/display
metadata, not proof of device identity. A new login context or successful
password recovery applies a 24-hour outgoing-transaction cooldown. Passkey,
session, step-up, configuration, and database-index details are documented in
[PASSKEY_SECURITY.md](./PASSKEY_SECURITY.md).
