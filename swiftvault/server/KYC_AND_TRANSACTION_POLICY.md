# KYC and transaction-policy readiness

SwiftVault's existing `tier` and `isUpgraded` fields remain legacy membership/pricing data. KYC state is stored independently in `KycProfile`; no BVN, NIN, identity document, or biometric values are collected by this implementation. Provider references are excluded from ordinary model selection and are not returned by the user/admin status APIs.

## Current fail-closed state

No identity-provider integration or tier-specific compliance requirements are configured. BVN, BVN name/date-of-birth matching, NIN matching, and face/liveness are explicitly `UNCONFIGURED`. The app does not simulate identity-provider responses or promote users even if verification statuses are edited in storage. Address and supporting documents are shown only as conditional examples; they are not asserted to be universally required. Tier 3 remains unapprovable until its actual requirements are approved. Manual decisions require admin authentication, Admin PIN, a reason, an evidence reference, and a transactional KYC audit record.

The customer tier policy defaults to unapproved, disabled, and without limits or a timezone. Atomic daily usage reservations have not yet been implemented, so the code refuses all customer funding-account creation, transfers, membership purchases, and wallet-funded service purchases even if a database record is edited by hand. A signed Monnify deposit for an existing reserved account is durably quarantined (not credited) when the account is unmatched, suspended, unverified, or its funding policy is unavailable; administrators can view held exceptions for manual handling. The exception has a unique payment-reference index so a repeated callback cannot create a second exception or credit. Existing signed settlement and duplicate-credit protection for already-created outgoing disbursements remain active. No policy-activation endpoint or numerical defaults are provided.

Paystack customer and dedicated-account status is stored separately from `KycProfile` and never promotes a SwiftVault tier. DVA assignment requires the existing verified-tier funding policy, express customer consent, and completed Paystack customer identification. Paystack's `bank_account` identification is not a substitute for SwiftVault's approved BVN/date-of-birth/face checks or Tier 2 NIN/identity checks. This build has no authorized identity provider or stored BVN/bank-account source, so DVA assignment remains fail-closed until those existing KYC dependencies and policy are approved; no new identity form or raw identity storage is introduced. Signed Paystack lifecycle events update only Paystack state, and incoming DVA charges require server-side transaction verification before existing settlement or suspense handling.

## Production dependencies

Before enabling regulated flows, the business must supply and obtain compliance approval for:

- Licensed business model, regulatory classification, sponsor bank/PSP permissions, and approved KYC/AML, monitoring, escalation, and retention policies.
- Identity-provider contracts, official API specifications, credentials, permissions, matching semantics, liveness support, and biometric retention/deletion terms.
- Requirements for each of the three verification tiers and any authorized manual-review evidence.
- A sourced, approved per-tier policy for limits, eligible services/payment methods, and an explicit daily-accounting timezone.
- Confirmed Monnify business-account activation and sandbox/live credential separation.

Live Monnify API calls are hard-disabled in this build because sandbox/live credentials are not separated and business-account activation/compliance approvals are unconfirmed. Production rejects sandbox URLs as well, so no Monnify network operation is currently available in production. The `.env.example` retains the sandbox URL for local development only.

The current policy is intentionally non-activatable through the application. Atomic daily reservations, final approved limits, provider callbacks for KYC, and production provider integrations must be completed and tested from the approved contracts before any policy can safely be enabled. Do not change `enforcementEnabled` directly in MongoDB.
