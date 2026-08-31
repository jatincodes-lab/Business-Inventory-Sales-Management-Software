# Design System: StockFlow Inventory Management

## 1. Product and design read

StockFlow is a serious B2B operations application for purchasing, inventory, sales, invoicing, and payments. Use the supplied StockMind HTML reference as the visual direction: a calm, table-first workspace with a compact navigation shell, clear status hierarchy, and fast CRUD workflows.

The interface should feel dependable, operational, and quietly polished—not like a marketing site and not like a decorative AI dashboard.

- Visual density: 6/10 — daily-app balanced, with enough room for scanning.
- Layout variance: 4/10 — mostly predictable for operational speed, with occasional asymmetric dashboard modules.
- Motion intensity: 3/10 — restrained CSS transitions and short spring-like feedback.
- Primary audience: business owners, purchase staff, sales staff, inventory staff, and managers.

## 2. Visual atmosphere

Use a light application canvas with a dark green navigation rail and white working surfaces. The page should be crisp, structured, and easy to audit. Borders and spacing establish hierarchy more often than heavy shadows. Green is reserved for primary actions, active navigation, positive stock states, and confirmed transactions.

The reference uses a collapsible desktop sidebar, a mobile drawer, a top utility bar, compact rounded controls, status badges, and table-led screens. Keep those patterns consistent across every module.

## 3. Color palette and roles

Use one visual accent: green. Semantic warning, danger, and information colors are reserved for their operational meanings only.

- **Application Canvas** — `#f7f8fa` — global page background.
- **Surface White** — `#ffffff` — panels, tables, forms, dialogs, and cards.
- **Sidebar Deep Green** — `#0e1f16` — desktop sidebar and mobile navigation drawer.
- **Sidebar Soft Green** — `#16291e` — selected/hovered sidebar item and nested navigation.
- **Heading Slate** — `#0f172a` — page titles, table headings, and high-priority values.
- **Body Slate** — `#334155` — primary body copy and normal table values.
- **Secondary Slate** — `#475569` — descriptions and supporting labels.
- **Muted Slate** — `#64748b` — metadata, timestamps, placeholders, and inactive controls.
- **Faint Slate** — `#94a3b8` — low-priority hints and disabled content.
- **Border Slate** — `#e2e8f0` — structural borders and table rules.
- **Subtle Border** — `#f1f5f9` — quiet dividers and grouped sections.
- **Primary Green** — `#00a63e` — primary buttons, active states, focus rings, links, and positive operational emphasis.
- **Primary Strong** — `#008a34` — primary button hover/pressed state.
- **Primary Soft** — `#e6f8ee` — selected backgrounds and positive lightweight badges.
- **Success** — `#16a34a` — posted, paid, received, and healthy stock.
- **Warning** — `#f59e0b` — pending, partially received, due, and low stock.
- **Danger** — `#ef4444` — blocked, cancelled, overdue, negative adjustment, and validation errors.
- **Info** — `#0ea5e9` — informational status only.

Never use pure black (`#000000`), purple/neon gradients, colored glow effects, or multiple competing brand accents. Semantic colors must always be paired with a readable text label or icon; color alone must not communicate status.

## 4. Typography

Use a sans-serif system suitable for dense software UI.

- **Display and page headings:** Geist, `font-weight: 600–700`, tight tracking (`-0.02em`).
- **Body and controls:** Geist, `font-weight: 400–600`, relaxed line height (`1.45–1.6`).
- **Operational numbers and document IDs:** Geist Mono, especially quantities, prices, SKUs, invoice numbers, and timestamps.
- **Fallbacks:** `ui-sans-serif, system-ui, sans-serif` and `ui-monospace, SFMono-Regular, Consolas, monospace`.

Suggested scale:

- Page title: `28–32px`, line-height `1.15`.
- Section title: `18–22px`, line-height `1.25`.
- Body: `14–16px`.
- Table text: `13–14px`.
- Metadata and labels: `11–12px`, uppercase only for compact section labels.

Do not use serif fonts, novelty display fonts, overly wide tracking, all-caps paragraphs, or headlines that wrap into many short lines.

## 5. Shape, spacing, and elevation

Use a consistent rounded scale:

- Small controls and fields: `8px` radius.
- Buttons and navigation items: `10–12px` radius.
- Panels, dialogs, and larger surfaces: `14–16px` radius.
- Avatars and status dots: full circle.

Use a 4px spacing base. Prefer `16px`, `20px`, `24px`, and `32px` gaps. Keep page content inside a `max-width` of approximately `1400px` with responsive horizontal padding.

Prefer borders, whitespace, and grouping over shadows. Use a soft, background-tinted shadow only for dialogs, dropdowns, and surfaces that must float above content.

## 6. Application shell

### Desktop

- Fixed left sidebar, approximately `256px` expanded and `72px` collapsed.
- Sidebar has a compact logo header, collapse control, grouped navigation, and profile footer.
- Main content starts after the sidebar and uses a stable top utility bar.
- Preserve the sidebar’s dark green identity while the workspace remains light.

### Mobile and tablet

- Replace the desktop sidebar with a left drawer and a dimmed overlay.
- Keep touch targets at least `44px` high.
- Tables may scroll horizontally inside their own contained region; the page itself must not horizontally overflow.
- Collapse multi-column summary areas to one column below `768px`.

### Navigation groups

Use these groups and labels:

- Dashboard
- Inventory: Items, Warehouses, Stock Movements, Adjustments, Stock Count
- Purchases: Vendors, Purchase Orders, Goods Receipts
- Sales: Customers, Sales Orders, Invoices, Payments
- Reports
- Administration: Users, Roles & Permissions, Company Settings, Audit Log

Do not include AI Insights, Demand Forecasting, or integrations in the first release unless implemented as real features.

## 7. Page patterns

### List pages

- Page heading and one primary action at the top.
- Search/filter row immediately below.
- Table with stable column alignment and right-aligned money/quantity values.
- Status badges with text labels.
- Pagination or explicit result count.
- Row actions in a compact overflow menu.
- Empty state explains how to create the first record.

### Detail pages

- Breadcrumb or back link.
- Summary header with document number, status, date, and main actions.
- Tabs only when content is genuinely separate: Overview, Lines, Payments, Activity.
- Line-item table for purchase orders, receipts, sales, and invoices.
- Totals panel aligned to the right on desktop and stacked on mobile.
- Activity/history section for auditability.

### Forms

- Labels above fields; no floating labels.
- Required fields use a visible but quiet indicator.
- Group related fields into sections with clear headings.
- Inline validation appears next to the relevant field.
- Destructive or irreversible actions require a confirmation dialog that states the consequence.
- Use native date, number, and select controls where they meet the need.

### Dashboard

Use a restrained bento-like grid only where it improves scanning:

- A compact top row for stock, low-stock, receivables, and payables.
- A wide recent activity or sales/purchases panel.
- A focused low-stock or pending-receipts panel.
- Quick actions near the page heading, not as a large hero section.

Avoid equal three-card feature rows, excessive charts, and decorative illustrations that do not help an operator decide what to do next.

## 8. Workflow-specific visual rules

- Draft documents use neutral slate styling.
- Submitted/confirmed documents use blue or neutral informational styling.
- Partially received or partially paid documents use warning styling.
- Posted, received, dispatched, or paid documents use success styling.
- Cancelled or blocked documents use danger styling.
- Never make a draft appear as if it has changed stock.
- Show ordered, received, remaining, and available quantities together where relevant.
- Show the warehouse on every stock-affecting document.
- Show the source document and user in stock movement history.
- For invoice posting, make the stock-decrease consequence explicit before confirmation.

## 9. Components and interaction states

### Buttons

- Primary: green fill with white text; hover uses `#008a34`.
- Secondary: white or transparent surface with slate text and a border.
- Destructive: danger text or fill only when the action is genuinely destructive.
- Active feedback: `transform: translateY(1px)` or `scale(0.98)`.
- Disabled state must reduce contrast without becoming unreadable.

### Tables

- Use a clear header row, consistent row height, and subtle horizontal dividers.
- Preserve numeric alignment and use monospace for high-scan values.
- Provide loading skeleton rows that match the final table shape.
- On narrow viewports, allow the table region—not the whole document—to scroll.

### Cards and panels

Use a panel only when it groups a meaningful unit of information. Avoid nested cards. Use section borders and whitespace for simple grouping.

### Inputs

- Minimum height `40–44px`.
- Visible focus ring in primary green.
- Placeholder text is muted and never replaces a label.
- Error text appears below the field in danger color.

### Dialogs and menus

- Use clear titles and consequence-focused descriptions.
- Trap focus in dialogs and support Escape to close.
- Anchor menus to their triggering control and keep them within the viewport.

### Notifications

Use notifications for transient results only. Persistent errors belong inline or in the page state. Include an action when recovery is possible.

## 10. Motion and accessibility

Motion should be short, purposeful, and hardware-friendly:

- Standard transition: `150–200ms`.
- Use opacity and transform only; do not animate layout dimensions.
- Sidebar and drawer transitions may use a restrained ease-out.
- Lists can use a subtle stagger, but never delay essential content.
- Respect `prefers-reduced-motion` and remove nonessential animation.
- All controls must be keyboard reachable with visible focus.
- Maintain readable contrast in light and dark surfaces.
- Never rely on color alone for stock, payment, or document status.
- Use meaningful labels and accessible names for icon-only actions.

## 11. Anti-patterns — never do these

- No emojis in the application UI.
- No pure black, neon gradients, purple glow, or glassmorphism everywhere.
- No generic marketing hero on authenticated operational screens.
- No centered oversized hero layouts for dashboard pages.
- No three equal decorative cards as the default composition.
- No nested card-inside-card-inside-card layouts.
- No fake metrics, fake customer names, or meaningless placeholder activity in production screens.
- No invented AI features or forecast data unless backed by a real implementation.
- No ambiguous status colors without text labels.
- No direct edits to posted documents; use reversals, returns, or adjustments.
- No hidden stock changes on draft actions.
- No horizontal page overflow on mobile.
- No custom mouse cursors.
- No filler copy such as “Elevate,” “Seamless,” “Next-Gen,” “Unleash,” or “Scroll to explore.”

## 12. Reference mapping

The supplied StockMind reference informs the following decisions:

- Collapsible grouped sidebar.
- Dark green navigation rail with light operational workspace.
- Compact top utility bar with search, notifications, and profile.
- Rounded controls and restrained status badges.
- Table-first CRUD pages.
- Role and permission matrix with module rows and View/Create/Edit/Delete columns.
- Responsive mobile navigation drawer.

The reference is inspiration for the system language only. StockFlow’s domain rules, labels, data, and transaction behavior must remain real and specific to inventory management.
