# Tier and upgrade rules

## Existing tiers and account role

The existing customer tier values are `normal`, `retail`, and `wholesale`. Existing code used those values as VTU pricing selectors and offered separate retail/wholesale fee transitions; it did not define tier eligibility, KYC levels, or tier-based transaction limits. The `role` field was also used to identify admins. Customer permissions now remain in `role` (`user` or `admin`), and the customer tier is stored separately in `tier`. The legacy labels are preserved; no additional meaning is assigned to them.

Run `npm run migrate:tiers` in the server directory before deploying the new code. This idempotent migration copies existing `retail`/`wholesale` role values into `tier`, maps other customer tiers to `normal`, preserves admins as admins, and maps customer roles to `user`. It does not change upgrade status or wallet balances. Back up the database and verify the target MongoDB environment before running it.

## Paid upgrade

A paid upgrade is a separate `isUpgraded` membership state and never changes `tier`. The fee defaults to ₦3,000 and can only be changed by an authorized admin with Admin PIN confirmation. This is SwiftVault's membership fee, not Peyflex's separate yearly top-reseller membership fee or an entitlement purchase. A user pays the configured amount from an already-funded wallet and confirms with their transaction PIN. The purchase, membership transition, company allocation, eligible referral credit, transaction records, and financial audit entries are committed in a MongoDB transaction. The server determines referral eligibility from the referrer's database record when processing the purchase. Retry keys and unique indexes prevent repeat processing.

The eligible referrer receives ₦1,500 when already upgraded at confirmation; the company receives the rest of the configured fee. Without an eligible referrer, the company receives the full fee. The fee cannot be configured below ₦1,500. Tier management does not create a charge, benefits, or a referral reward.

The production MongoDB deployment must support multi-document transactions (a replica set or sharded cluster). Upgrade purchases fail closed if transaction support is unavailable; there is no non-atomic fallback.

## Pricing

VTU price selection ignores tier. Normal pricing remains active for all accounts until an admin explicitly configures and enables the separate upgraded schedule. Both schedules are calculated server-side from the exact product's admin-managed provider cost and fee, plus the existing per-service selling-price rules. Tier, SwiftVault upgrade status, and Peyflex account discount entitlement are independent.

Peyflex cost endpoints and account discount entitlements are not verified in this integration. An admin must enter product-specific costs, applicable fees, a safe evidence reference, and an explicit future `validUntil` date in Admin > VTU Pricing. Missing or expired entries block quotes and purchases. Cost entries are keyed by `service`, `provider`, and `product`; dynamic products use the face value or plan/type/face-value identity shown in the admin screen. The system does not derive top-reseller status from a SwiftVault upgrade and does not assume returned plan amounts are provider costs.

Each pending purchase stores the selling-price schedule, configured provider-cost and provider-fee estimates, entitlement snapshot, and validity date. Configured amounts are pricing estimates, not proof of Peyflex's final charges. Successful settlement and company-margin booking require an admin to enter both provider cost and provider fee confirmed from provider evidence. Admin statistics exclude sales with unknown final provider charges from verified revenue and profit, and report them separately. User transaction responses omit provider costs and pricing snapshots.

## Peyflex API contracts

The verified contracts in this integration are limited to:

- `GET /api/cable/providers/` with the server-side `Authorization: Token <API_TOKEN>` header.
- `POST /api/cable/verify/` with `identifier` and `iuc`, using the server-side token.
- `POST /api/cable/subscribe/` request fields `identifier`, `plan`, `iuc`, optional `phone`, and optional `amount`, using the server-side token. This verifies only the request format; the plan-list and purchase-response contracts are not verified, so the application purchase route remains blocked.
- `GET /api/electricity/verify/` with the documented `identifier`, `meter`, `plan`, and `type` query parameters and no authorization header.

The base URL is `https://client.peyflex.com.ng`. No purchase-success response example or terminal failure response contract was supplied, so even a body containing `status: "SUCCESS"` or `status: "FAILED"` is not terminal evidence. Peyflex purchase responses and HTTP errors remain pending; the app does not automatically settle or refund them. The 15-second timeout does not change that rule.

Blocked pending documentation/provider confirmation: airtime networks and purchases; data networks, plans, and purchases; cable plan listing and app purchase flow; electricity plans and purchases; ePIN options and purchases; education providers and PIN purchases; and any Peyflex status-query endpoint. Their guessed request bodies/paths are not sent. Do not enable these routes until exact request and response contracts have been reviewed and added as tests.

## Provider-dependent features

The app keeps the exact account name returned by Monnify and displays the SwiftVault username separately. It sends the registered full name when requesting a reserved account; this project does not establish that Monnify permits arbitrary recipient-name personalization.

The existing Peyflex wrapper sent a `brand_name` field, but the project contains no verifiable provider documentation or contract establishing support for reseller-branded ePIN slips. The app therefore no longer sends a reseller-supplied brand name and does not claim that branded slips are supported. Provider-specific branding remains disabled pending written provider confirmation and official API documentation.
