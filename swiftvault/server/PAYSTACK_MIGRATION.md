# Paystack Wallet Funding Migration

## Development Safety

- `PAYSTACK_LIVE_PAYMENTS_ENABLED` defaults to `false`; real provider HTTP calls are permitted only when the server is running in production and the flag is explicitly `true`.
- Automated tests must inject a mocked HTTP transport. Do not configure or use a live secret key in tests or development.
- `PAYSTACK_SECRET_KEY` is server-only and may instead be set through the encrypted, write-only admin credential screen. Never add it to Vite variables or client code. `PAYSTACK_PUBLIC_KEY` is accepted for configuration/status but is not needed by the hosted-checkout flow.
- `PAYSTACK_CALLBACK_URL` must be HTTPS, except for localhost development. The browser redirect is only a request to verify; it is not proof of payment.
- No production flag changes or real payments are part of the development migration.

## Pre-Cutover Gate

All items below require explicit operational review before changing production traffic:

1. Focused Paystack tests, the complete server suite, client lint, and client production build pass in CI.
2. Review exact reference, NGN, kobo amount, customer/email, pending-record, webhook-signature, and server-verification checks.
3. Review authorization, transaction-PIN lockout, one-use step-up grants, policy/KYC gating, rate limits, and webhook logging/redaction.
4. Verify atomic wallet update, funding transaction, and journal posting on a MongoDB replica set in an isolated test environment; include failure and concurrent replay cases.
5. Confirm legacy account deposits and pending bank payouts are reviewed before cutover. Monnify callbacks, account creation, and payout initiation are no longer available; legacy financial records remain stored for audit and ledger history.
6. Confirm the approved funding policy explicitly lists `paystack` and its limits. Policy enforcement currently fails closed until atomic daily transaction reservations are ready; do not bypass that gate.
7. Obtain an appropriate Paystack test key for isolated provider sandbox checks. Never use a live key for these checks.
8. Complete a separate deployment, monitoring, reconciliation, and support runbook review. This code change does not constitute production readiness.

## Rollback

1. Keep `PAYSTACK_LIVE_PAYMENTS_ENABLED=false` until the cutover is approved.
2. If a later approved rollout has enabled Paystack, set the flag back to `false` through the deployment configuration and verify the status endpoint reports disabled.
3. Do not delete Paystack pending/settled transactions, funding exceptions, journals, webhook logs, or historical provider data. Review any in-flight payment using server-side verification and the approved financial procedure.
4. Paystack transfer webhooks are recorded as held and never settle payouts; outbound bank transfers and company withdrawals remain unavailable until an approved Paystack payout integration is implemented.
5. Review balances against immutable journal entries and provider settlement reports before resuming payment processing.

## Current Cutover State

Paystack is the only active wallet-funding and dedicated-account provider in the application. Live initialization remains disabled by default and requires production mode plus an explicit server flag. No production traffic switch, live API call, or database migration is performed by this implementation.