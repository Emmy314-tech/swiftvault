# Customer support requests

Authenticated customers can create requests, view their own request history, and
reply to open, resolved, or closed requests. A customer reply to a resolved or
closed request reopens it. Ticket ownership always comes from the authenticated
server session; request payloads cannot choose the owner or status.

Administrators access the support queue through `/api/admin/support-tickets`.
The existing admin router applies authentication and the admin-role guard to
the list and update endpoints. Replies and status changes retain the actor and
timestamp in the ticket message and status histories.

The support collection and its customer/status indexes are created by the
server's normal startup index initialization. No attachments are accepted.
Customers are warned not to submit passwords, transaction PINs, OTPs, card
details, or private authentication information. Support is an in-app workflow;
it does not itself execute or confirm a financial transaction.
