# Inventory Management Software — Project Plan

## 1. Product goal

A web application for a small or mid-sized business to manage vendors, purchasing, stock, customers, sales, invoices, payments, and operational permissions from one dashboard.

The first release optimizes for one reliable flow:

`Vendor → Purchase Order → Goods Receipt → Stock Increase → Customer Sale → Invoice → Stock Decrease`

## 2. Working assumptions

- One business account, with support for multiple warehouses.
- Items are tracked by quantity and unit; SKU is unique within the business.
- Purchase orders and sales orders do not change stock while they are drafts.
- Posting a goods receipt increases stock.
- Posting/dispatching a sales invoice decreases stock.
- Negative stock is blocked by default.
- Taxes, currency, invoice numbering, and company details are configurable.
- Desktop is the primary workspace; the UI remains usable on tablet/mobile.

## 3. MVP scope

### Dashboard

- Stock value/quantity summary.
- Low-stock items.
- Pending purchase orders and receipts.
- Recent sales and invoices.
- Quick actions: new purchase order, receive stock, new sale, new customer.

### Master data

- Items: SKU, name, category, unit, purchase price, sale price, tax rate, reorder level, active status.
- Categories and units.
- Vendors: contact details, tax/business ID, payment terms, opening balance.
- Customers: contact details, tax/business ID, payment terms, opening balance.
- Warehouses and storage locations.
- Company profile and invoice settings.

### Purchasing

- Create, edit, approve, cancel, and view purchase orders.
- Add item lines, quantities, prices, tax, discount, and notes.
- Record full or partial goods receipts against a purchase order.
- Show ordered, received, and remaining quantities.
- Record purchase returns later using the same stock-movement model.

### Inventory

- Current stock by item and warehouse.
- Stock movement history with source document.
- Manual stock adjustment with reason.
- Stock count/reconciliation.
- Low-stock view based on reorder level.

### Sales and invoicing

- Create customer sales orders or invoices.
- Add item lines, quantity, price, tax, discount, and notes.
- Validate available stock before posting.
- Post/dispatch invoice to decrease stock.
- Record full or partial payment and payment status.
- Print a clean invoice from an HTML print view; add PDF generation only if needed.
- Sales returns later using the same movement model.

### Users and permissions

- Authentication and session management.
- Custom roles with module-level View/Create/Edit/Delete permissions.
- Suggested roles:
  - Owner: everything, including users, roles, settings, and audit history.
  - Manager: purchasing, sales, inventory, reports; no role administration.
  - Purchase Staff: vendors, purchase orders, receipts.
  - Sales Staff: customers, sales, invoices, payments.
  - Inventory Staff: items, warehouses, receipts, adjustments, stock counts.
  - Viewer: read-only access.
- Enforce permissions on the server/API as well as in navigation and buttons.
- Audit important actions: posting, cancelling, adjusting stock, changing roles, and changing invoice settings.

## 4. Core status rules

### Purchase order

`Draft → Submitted → Partially Received → Received`

`Draft/Submitted → Cancelled`

Only a posted receipt changes stock. A receipt cannot exceed the remaining ordered quantity unless an authorized user explicitly allows over-receiving.

### Sales order/invoice

`Draft → Confirmed → Invoiced/Dispatched`

`Draft/Confirmed → Cancelled`

Only the posted/dispatch action changes stock. Drafts never reduce stock. Cancellation after posting creates a reversal instead of deleting history.

### Stock

Stock is represented by an append-only movement ledger. Each posted receipt, sale, return, adjustment, or transfer creates a movement linked to its source document. A balance table may be maintained for fast reads, but the ledger remains the audit source of truth.

## 5. Initial data model

- `businesses`
- `users`
- `roles`
- `permissions`
- `role_permissions`
- `categories`
- `units`
- `items`
- `warehouses`
- `vendors`
- `customers`
- `purchase_orders`, `purchase_order_lines`
- `goods_receipts`, `goods_receipt_lines`
- `sales_orders`, `sales_order_lines`
- `invoices`, `invoice_lines`
- `payments`
- `stock_movements`
- `stock_balances`
- `audit_logs`

Important constraints:

- Unique document number per business and document type.
- Unique SKU per business.
- No negative stock during a posting transaction.
- Posted documents are immutable; corrections use returns, reversals, or adjustments.
- Receipt and invoice posting plus stock changes happen in one database transaction.

## 6. UI direction

Follow the supplied StockMind reference as a design language, not as a feature checklist:

- Dark navy application shell with a collapsible left sidebar.
- Group navigation into Dashboard, Inventory, Purchasing, Sales, Reports, and Administration.
- Compact top bar with search, notifications, theme toggle, and profile menu.
- Table-first screens with clear status badges, filters, pagination, and primary actions.
- Rounded controls and panels, restrained green accent, high-contrast text.
- Detail screens use a summary header, tabs/sections, line-item table, totals panel, and activity history.
- Every data screen needs loading, empty, error, and permission-denied states.
- Use one icon family consistently and keep interactions keyboard accessible.

## 7. Locked technical direction

Use one conventional full-stack application so the first release has the fewest moving parts:

- **Application:** Next.js App Router with TypeScript.
- **Server/API:** Next.js Route Handlers for authenticated server endpoints.
- **Database:** Supabase Postgres.
- **Database access:** `@supabase/supabase-js` with generated TypeScript database types.
- **Database changes:** Supabase SQL migrations in `supabase/migrations`.
- **Validation:** Zod schemas shared by forms and server handlers.
- **Authentication:** Supabase Auth with `@supabase/ssr` and cookie-based sessions.
- **Authorization:** application roles plus Postgres Row Level Security (RLS) policies.
- **UI:** Tailwind CSS plus a small local component layer following `Design.md`.
- **Icons:** Phosphor Icons, one icon family only.
- **Invoice output:** print CSS first; add PDF generation only if a real requirement appears.
- **Local development:** Supabase CLI/local stack when a local database is needed.

Use Supabase Auth instead of a custom password/session system. Keep the Supabase service-role key server-only. Use RLS for row access and Postgres functions/RPC for stock-posting operations that must update balances and movements atomically.

This follows the official Next.js App Router/Route Handler model and Supabase's Next.js SSR, Auth, and RLS guidance. It keeps the UI, server logic, migrations, and domain rules in one repository without adding a separate API service or ORM layer.

### Proposed repository shape

```text
app/                    routes, layouts, loading/error states
components/             shared UI components
lib/supabase/           browser/server Supabase clients and generated types
features/               domain modules and server actions/queries
lib/                    validation, permissions, formatting
supabase/               migrations, seed data, and database functions
public/                 static assets
```

Keep domain logic in `features/` or `lib/`, not inside large page components. Keep stock posting operations in protected server functions or Postgres RPC functions called from the relevant route handler/action.

## 8. Delivery phases

### Phase 0 — Foundation and proof of life

- Scaffold the locked stack and verify a production build.
- Add environment validation without committing secrets.
- Add the StockFlow shell: sidebar, top bar, responsive drawer, theme tokens, and route-level loading/error states.
- Add Supabase SQL migrations, generated database types, seed data, and RLS baseline.
- Add Supabase Auth, the initial Owner role, protected routes, and server permission helper.

**Exit check:** an Owner can sign in and reach a protected dashboard; an unauthenticated request cannot.

### Phase 1 — Master data and permissions

- Items, categories, units, vendors, customers, warehouses.
- Users, roles, permission matrix, and audit log.
- Shared table, form, filter, status, and confirmation patterns.

**Exit check:** an Owner can create/edit/deactivate an item, vendor, customer, and warehouse; invalid input is rejected in the browser and server; permission checks work on direct requests.

### Phase 2 — Purchase to stock

- Purchase order creation and status transitions.
- Partial/full goods receipt.
- Transactional stock movement and balance updates.
- Inventory list and movement history.

**Exit check:** a partial receipt increases only the received quantity; duplicate posting is safe; stock history identifies the document and user; a negative balance cannot be created.

### Phase 3 — Sales to invoice

- Customer sale/invoice creation.
- Stock availability validation.
- Posting/dispatch and stock decrease.
- Payments, invoice status, and print view.

**Exit check:** an invoice cannot post beyond available stock; posting decreases the correct warehouse balance exactly once; the print view contains the required invoice data.

### Phase 4 — Hardening

- Stock count and adjustments.
- Returns and reversal flows.
- Reports: stock, purchase, sales, outstanding payments.
- Validation, authorization, audit review, responsive polish, backups, and deployment.

**Exit check:** the final checklist in `Rules.md` passes for each changed area and the purchase-to-stock and sales-to-invoice flows have repeatable automated checks.

## 9. First implementation tasks

Implement in this order, one small verified slice at a time:

1. Scaffold the Next.js application and install only the locked dependencies.
2. Add the shared theme tokens and StockFlow shell from `Design.md`.
3. Add Supabase clients, SQL migrations, generated database types, and seed data.
4. Add Supabase Auth, users, roles, permissions, RLS policies, login, logout, and route protection.
5. Add items, vendors, and warehouses with reusable list/form patterns.
6. Add purchase orders and line-item editing.
7. Add goods receipt posting, `stock_movements`, and `stock_balances` in one transaction.
8. Add stock list and movement history.
9. Run the first vertical-slice checks before starting customers, sales, or invoices.

## 10. Acceptance criteria for the first usable release

1. An owner can create an item, vendor, customer, and warehouse.
2. A purchase order can be created and partially received.
3. Only the received quantity appears in stock.
4. A sale/invoice cannot be posted above available stock.
5. Posting the invoice reduces the correct warehouse balance.
6. A printable invoice shows company, customer, line items, tax, discount, total, and payment status.
7. Users see only permitted modules and cannot bypass permissions through direct requests.
8. Every stock-affecting action is traceable to a document and user.
9. Refreshing or retrying a post action cannot duplicate a receipt, invoice, payment, or stock movement.

## 11. Explicitly deferred

- AI insights and demand forecasting.
- Barcode scanning and hardware integrations.
- Multi-business tenancy.
- Accounting/GST platform synchronization.
- Marketplace/e-commerce integrations.
- Complex batch, serial-number, expiry, and manufacturing workflows.

Add these only after the basic stock ledger and document flows are being used successfully.

## 12. First build slice

Start with the smallest vertical slice that proves the system:

1. App shell and login.
2. Item, vendor, and warehouse creation.
3. Purchase order creation.
4. Goods receipt posting.
5. Stock balance and movement history.

After that works end to end, add sales/invoicing on the same stock-movement foundation.
