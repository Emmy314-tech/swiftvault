# Passkeys, sessions, and sensitive-action authorization

## Configuration

Set these server environment variables before enabling passkey enrollment or
passkey sign-in:

- `WEBAUTHN_RP_ID`: the relying-party domain, without a scheme or path (for
  example, `swiftvault.example`).
- `WEBAUTHN_ORIGINS`: comma-separated, exact browser origins (for example,
  `https://swiftvault.example,https://app.swiftvault.example`).

Production origins must use HTTPS. HTTP is accepted only for localhost
development. If either setting is absent or invalid, passkey endpoints return
an explicit unavailable response; password sign-in remains available. Deploy
the frontend only on origins listed in this allowlist.

## Authentication and device records

Passkey enrollment requires an authenticated session and a current-password
check. The server verifies the challenge, origin, relying-party ID, and user
verification flag before storing only the credential ID, public key,
authenticator counter, supported transports, and non-biometric device metadata.
Private keys, PINs, biometric images, and biometric templates are not stored.
Login uses discoverable credentials and does not accept a client-supplied user
or device ID as proof.

Challenges are single-use, session-bound where applicable, and expire after
five minutes. Credential counters are conditionally updated to prevent
concurrent/replayed assertions. Session and passkey revocation are scoped to
the authenticated account. Session IP and user-agent values are risk signals
and display metadata only; they are not authentication factors.

An unrecognized IP/user-agent combination on an account with prior sessions,
successful account recovery, and passkey revocation apply a 24-hour
outgoing-transaction cooldown. A first-ever sign-in does not trigger a
new-context cooldown. The cooldown is restrictive
only; it does not grant trust or bypass KYC, transaction policy, service
approvals, or existing transaction PIN checks. New-context logins, completed
account recovery, and passkey revocation attempt high-priority in-app security
notifications. Notification delivery is best-effort and logged; it is not an
email/SMS alert guarantee.

Sensitive outgoing actions require a short-lived, action- and request-bound
step-up grant. Passkey verification is preferred when available; the current
account password is the fallback. Grants are stored only as hashes, expire
after two minutes, are bound to the current session, and are atomically
consumed by the protected endpoint. Transaction and membership requests remain
blocked by the existing unconfigured KYC/transaction policies. No payment
provider or live money movement is enabled by this feature.

## Database deployment

The server creates indexes for passkey credentials, single-use challenges,
step-up grants, security audit events, and the additional session lookup data
at startup. New collections are created by MongoDB on first write. Existing
session records remain valid and can lack device metadata; they are not
backfilled. Do not run these index changes against production without the
normal deployment review and backup procedure.

Security-event records are append-only through the application model. They
are not tamper-proof against database administrators or direct database writes;
production audit integrity requires appropriately restricted database roles
and monitored backups.

## Remaining limitations

- New-context detection uses IP address and user-agent changes as conservative
  signals and can cause false-positive cooldowns (for example, on mobile
  networks); these signals do not prove device identity.
- Passkey enrollment, login, and WebAuthn verification require a configured
  relying-party domain and have not been tested against production browsers or
  hardware authenticators.
- Recovery currently applies the cooldown but does not automatically revoke
  previously registered passkeys; users can revoke them from Device Management.
- No production deployment, database migration, live Monnify activity, or
  customer transaction was performed.
