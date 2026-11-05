# Payment architecture

Evaluate Stripe Connect, Adyen for Platforms and Mollie against supported countries, business model, onboarding, KYC/AML responsibilities, payout timing, disputes, fees and contractual restrictions. Availability and suitability must be confirmed for each launch market.

Keep provider-specific objects behind a payment adapter. Core concepts: payment intent, authorization, capture, refund, dispute, payout reference, invoice and journal.

Controls: provider-hosted/tokenized collection; never store raw PAN/CVV; do not custody funds without legal assessment and authorization; verify webhook signatures and process idempotently; maintain immutable double-entry journal and reconciliation; model refunds, chargebacks and failed payouts; complete PCI DSS scope analysis and legal review before live processing.
