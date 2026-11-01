# Pending Transaction Reconciliation

## Paystack funding and payouts

Paystack checkout funding is verified server-side against the local pending reference, amount, currency, customer, and funding metadata before atomic wallet settlement. Signed `charge.success` events trigger that verification; browser redirects alone do not prove payment.

Signed `transfer.success`, `transfer.failed`, and `transfer.reversed` webhook events are recorded as held. They do not update a user or company balance because SwiftVault has no Paystack payout initiation or matching local payout flow. User bank transfers and company withdrawals are disabled. Do not mark a legacy pending payout successful or failed from a webhook without matching it to an approved payout reference and external evidence.

Legacy Monnify transaction and ledger data is retained for audit/history; no Monnify API calls, callbacks, or new payouts are active. Review old pending payout/account activity using the approved offline financial procedure before controlled staging or production use.

## Peyflex VTU

No authoritative transaction-status endpoint, purchase-success response, or terminal failure response contract was supplied for Peyflex. SwiftVault therefore does not make a guessed status request or interpret a generic `SUCCESS`, `FAILED`, HTTP error, malformed response, or timeout as a final outcome. Ambiguous purchases remain pending and their debited funds remain held.

Manual process:

1. Find the transaction reference and amount in the admin reconciliation queue.
2. Verify that exact transaction in the Peyflex merchant portal or with Peyflex support. Confirm service, destination, amount, final status, and provider cost. Do not rely on a local HTTP timeout as evidence.
3. In the admin form, enter the provider portal/support ticket reference, a concise verification note, and the Admin PIN. Do not paste credentials, full provider payloads, screenshots containing customer data, or redeemable codes into the audit note.
4. Record `failed` only after the provider confirms no service was delivered; the pending-only settlement issues the wallet refund once. Record `success` only with confirmed provider evidence and both actual provider cost and fee. The configured pricing estimate is not accepted as final charge data.
5. Re-open reconciliation history and verify the recorded result. If provider status is still unclear, leave it pending and escalate to provider support.

Successful ePIN and exam-PIN transactions cannot be manually settled through this screen. The current product has no secure workflow for recovering/delivering redeemable codes after a lost provider response. Keep these pending and escalate; do not refund or mark successful until secure delivery/recovery is implemented.

## Audit and deployment

Every query/manual attempt records the transaction, provider, actor, mode, observed status, result, short reason, timestamp, and request IP. Provider credentials, raw API responses, and webhook payloads are not included in reconciliation records.

The server creates the unique wallet-funding reference index at startup. Before deployment, verify the database supports MongoDB transactions and reconcile any existing duplicate funding references; index creation intentionally fails startup if conflicting data prevents the unique index from being created.

Startup also creates unique source-reference indexes for referral bonus transactions, full journal reversals, and provider commission settlements. Check for conflicting historical records before deploying these constraints; do not delete or rewrite ledger history to make an index build succeed.

## Financial ledger reports

The Admin Revenue Report exports posted `revenue:` journal lines, not successful transaction amounts. Wallet funding, transfer principal, held deposits, and other customer funds are excluded. Financial reports remain unavailable until the evidence-based legacy backfill is approved and all unresolved source and wallet-reconciliation issues are cleared. External bank/provider statement reconciliation remains unconfigured; provider and processor costs must use confirmed source evidence rather than estimates.

Provider commissions are recorded only from an evidence-backed confirmed earning. An unpaid earning debits provider commission receivable; a separately referenced settlement clears that receivable to the company bank account without recognizing income again. Commission rates and amounts are not inferred or configured by this workflow.
