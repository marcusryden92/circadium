# Handoff: Moving the AI assistant from BYOK to MANAGED (paid tier + refund policy)

Context: Circadium (repo `lifeplan/`, see CLAUDE.md). The AI assistant currently runs BYOK: an in-browser tool-use loop on the user's own Anthropic key (device vault in `lib/aiKey.ts`, gating via `User.aiMode` + `AiAccessProvider`). `MANAGED` already exists in the `AiMode` enum, reserved for an app-key paid tier, and the engine's `baseURL` parameter (`createBrowserAnthropicClient`) is the intended seam for a thin auth+quota proxy. This handoff captures the product/billing decisions made so far.

## Decisions

### 1. Pricing shape: platform fee + usage credits

- Price is split, visibly at checkout, into a **plan fee** and a **usage-credit allowance** (e.g. "X/mo plan + Y in AI credits"). Exact numbers are not decided.
- Credits are denominated in **credits, not tokens**. Users never see tokens; the conversion lives server-side so pricing can change without changing terms.

### 2. Refund / guarantee policy

- Guarantee = **refund of the plan fee + any unused credits**, within a fixed window (length TBD, likely 7-14 days). Consumed usage is non-refundable because it is a real pass-through API cost.
- Do **not** market it as a "money-back guarantee" (misleading if partial). Wording along the lines of: "Full refund of your plan fee plus any unused AI credits within N days."
- Expect most cost in week one: the onboarding AI interview (brain-dump triage, full forest build, multi-turn tool loop) is the most token-heavy session and coincides with peak refund risk. Options (undecided): give onboarding a fixed small allowance, or treat onboarding usage as acquisition cost excluded from refund math. Also consider a lower usage cap during the guarantee window.

### 3. EU / Swedish consumer law (verify with a lawyer before launch)

- Consumers generally have a 14-day withdrawal right for online purchases. For digital services you can charge for what was already used (or the right can lapse) only with **explicit consent to immediate performance + acknowledgement at checkout**. Add a checkbox for this in the checkout flow; terms must state that consumed usage is non-refundable.

### 4. Proxy metering (the core engineering work)

- Add a server-side proxy that the browser engine targets via `baseURL` when `aiMode === MANAGED`. It authenticates the session, enforces quota, forwards to api.anthropic.com with the app's `ANTHROPIC_API_KEY`, and streams back.
- **Per-user credit ledger in our DB is the source of truth** (not Stripe). After each response, read `usage` (input / output / cache-read / cache-write tokens), price it, and debit the balance.
- **Reserve before forwarding, settle after.** The Stop button aborts streams, and an aborted stream can miss the final `message_delta` carrying usage. Reserve an estimate (input size + `max_tokens`) up front, then settle to actual (or keep the reservation if usage never arrives). This keeps aborted turns from leaking free usage and keeps refund math exact.
- **Lock the proxy down.** The tool loop runs client-side, so the client authors requests. The proxy must pin the model, cap `max_tokens`, and cap requests/turns, so it can't be used as a general-purpose discounted Claude endpoint. Credits bound the damage but don't prevent misuse.
- Refund amount = plan fee + unused credits, computed from the ledger.

### 5. Keep BYOK as an option

- `aiMode` already supports both. Keep BYOK for power users who want unlimited usage at zero risk to us; MANAGED becomes the default easy path.

### 6. Stripe integration

- Hosted **Stripe Checkout** launched from a server action (no custom payment form). Store `stripeCustomerId` + subscription status on `User` (new migration).
- **Webhook route** `app/api/stripe/webhook` (a legitimate exception to the server-actions-only rule, like the OAuth callbacks; update the CLAUDE.md code-style note listing allowed API routes). Handle at minimum:
  - `checkout.session.completed` → link customer, set `aiMode = MANAGED`
  - `invoice.paid` → top up the credit ledger
  - `customer.subscription.deleted` → drop back to `OFF` (or `BYOK` if a device key exists)
- **Customer Portal** (Stripe-hosted) for cancel / payment method / invoices.
- **Refunds** via `refunds.create` with an explicit amount computed from the ledger.
- **VAT:** enable Stripe Tax; selling to EU consumers means charging VAT at the buyer's country rate. Register for OSS with Skatteverket (one return instead of per-country).
- Build in test mode while Stripe account activation completes.
- Rough estimate: Stripe plumbing 1-2 days; ledger + proxy metering 2-4 days.

## Docs/code that assume BYOK and need updating

- CLAUDE.md "The key never crosses our trust boundary" contract becomes "the key never reaches the client" for MANAGED (BYOK path keeps the old contract).
- CLAUDE.md env section: `ANTHROPIC_API_KEY` becomes required (plus Stripe keys + webhook secret).
- CLAUDE.md "allowed API routes" rule: add `stripe/` (and the proxy route if it's an API route rather than a server action; streaming likely requires a route).
- `lib/aiKey.ts`, `AiAccessContext` (status derivation must treat MANAGED + active subscription + positive balance as `ready`, without a device key), `AssistantGate` copy, onboarding AI step copy, Settings → AI assistant (mode picker, balance display).
- Migration history entry for the new billing/ledger tables.

## Open questions

- Plan fee and credit allowance amounts; credit-to-cost conversion and margin.
- Guarantee window length; onboarding allowance vs exclusion.
- Do unused credits roll over month to month?
- Behavior at zero balance (hard stop vs top-up purchase).
