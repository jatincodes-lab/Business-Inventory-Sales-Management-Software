# Agent Context — StockFlow Inventory Management

## Mission

Build a reliable inventory management web application for a small or mid-sized business. The core operational chain is:

`Vendor → Purchase Order → Goods Receipt → Stock Increase → Customer Sale → Invoice → Stock Decrease`

The supplied StockMind HTML reference is the UI direction. Read [Design.md](./Design.md) before creating or changing interface code. Read [PROJECT_PLAN.md](./PROJECT_PLAN.md) for the planned scope and phases.

## Mandatory project rules

Read and apply [Rules.md](./Rules.md) before starting any implementation task. It is the required checklist for validation, alignment, security, database correctness, API behavior, UI consistency, accessibility, responsiveness, performance, logging, and code quality.

- Apply the rules to every new page, form, API, database operation, report, and UI component.
- Validate on both the client and server where applicable.
- Follow the field-specific rules in `Rules.md`; for example, numeric values are right-aligned and Indian mobile numbers are digits-only with exactly 10 digits where applicable.
- Run the final checklist in section 44 of `Rules.md` before declaring a task complete.
- If an explicit user requirement conflicts with a rule, follow the explicit requirement and clearly identify the consequence.

## Current repository state

- This is a greenfield workspace.
- The default application architecture is Next.js App Router + TypeScript + Supabase Postgres + Supabase Auth.
- Do not assume files, dependencies, database tables, or services exist.
- Before implementation, inspect the workspace and preserve this stack unless the user explicitly changes it.

## Product priorities

1. Correct stock movement and document posting.
2. Clear, fast workflows for daily operators.
3. Server-side authorization and auditability.
4. Simple responsive UI following `Design.md`.
5. Reports and enhancements only after the core transaction loop is reliable.

## Domain rules

- Draft purchase orders do not increase stock.
- Draft sales orders/invoices do not decrease stock.
- Posting a goods receipt increases stock for the selected warehouse.
- Posting/dispatching an invoice decreases stock for the selected warehouse.
- Block negative stock by default.
- Support partial goods receipts and partial payments.
- Posted documents are immutable.
- Corrections use returns, reversals, or stock adjustments; never silently delete posted history.
- Every stock-affecting action must create a movement linked to its source document and user.
- Receipt/invoice posting and stock changes must happen in one database transaction.
- Retrying a post request must not duplicate a document, payment, or stock movement.
- Use unique document numbers per business and document type.
- Use a unique SKU per business.

## MVP modules

- Dashboard
- Items, categories, and units
- Warehouses
- Vendors
- Customers
- Purchase orders
- Goods receipts
- Stock balances and movement history
- Stock adjustments and counts
- Sales orders
- Invoices
- Payments
- Users, roles, permissions
- Company settings
- Audit log

Defer AI insights, demand forecasting, barcode hardware, marketplace integrations, accounting synchronization, multi-business tenancy, and complex batch/serial/manufacturing workflows until the base system is in use.

## Suggested roles

- Owner: unrestricted access.
- Manager: operations and reports; no role administration.
- Purchase Staff: vendors, purchase orders, and goods receipts.
- Sales Staff: customers, sales orders, invoices, and payments.
- Inventory Staff: items, warehouses, receipts, adjustments, and counts.
- Viewer: read-only access.

Permissions must be checked in the server/API, not only by hiding navigation items. The UI should still hide inaccessible actions to keep the experience clear.

## UI implementation rules

- Use the design tokens, palette, typography, spacing, and component behavior in `Design.md`.
- Prefer table-first layouts for operational records.
- Use clear statuses: Draft, Submitted, Confirmed, Partially Received, Received, Dispatched, Paid, Cancelled, Overdue, and Blocked where applicable.
- Always include loading, empty, error, and permission-denied states.
- Keep primary actions obvious and limit each screen to one main primary action when possible.
- Keep tables readable; align quantities and money consistently.
- Use text plus color for status.
- Keep mobile touch targets at least 44px and prevent page-level horizontal overflow.
- Use the existing Lucide icon dependency throughout the application; do not add a second icon family.
- Avoid custom UI libraries or dependencies until the repository stack is known.

## Engineering rules

- Inspect existing code before adding helpers, components, dependencies, or abstractions.
- Prefer the standard library, native browser controls, database constraints, and existing project dependencies.
- Keep the change localized; do not create speculative architecture.
- Do not add AI, forecasting, integrations, or configurable complexity without a concrete requirement.
- Validate all trust-boundary input.
- Keep money calculations precise; use database numeric/decimal types and never rely on binary floating point for persisted currency.
- Use database transactions for posting operations.
- Use idempotency or a unique posting guard for retry safety.
- Never use destructive database operations to fix application mistakes without explicit approval.
- Do not edit or delete user changes unrelated to the task.
- Add the smallest runnable check for non-trivial business logic.

## Build order

1. Scaffold the locked stack and verify the production build.
2. Create the application shell and theme tokens.
3. Add authentication, Owner role, and protected routes.
4. Add Supabase clients, SQL migrations, generated database types, and seed data.
5. Add items, vendors, warehouses, and basic CRUD patterns.
6. Implement purchase order creation.
7. Implement goods receipt posting and stock ledger/balance updates.
8. Verify the purchase-to-stock slice end to end.
9. Add customers, sales, invoices, payments, and invoice printing.
10. Add adjustments, counts, returns, reports, and hardening.

## Definition of done for the first vertical slice

- An owner can create an item, vendor, and warehouse.
- A purchase order can be created with item lines.
- A full or partial goods receipt can be posted.
- Only the received quantity appears in the correct warehouse stock.
- The stock movement history shows source document, user, quantity, and timestamp.
- Repeating the post action does not duplicate the receipt or stock movement.
- Unauthorized users cannot post a receipt through a direct request.
- The UI follows `Design.md` and handles loading, empty, error, and denied states.
