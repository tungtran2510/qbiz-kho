# Feature Completion Pack — CURRENT → TARGET → GAP

Date: 2026-09-21  
Scope: Settings, Print, Reports, operational foundations. This document does not approve a production connector or SYNC-01.

## Contract status

- `SYNC-00`: `PASS_LOCAL_FOUNDATION`; `READY_FOR_SYNC_01=NO` — verified in `docs/SYNC_FOUNDATION_STATUS.md`.
- The required `QBIZ_KHO_HANDOFF_PLATFORM_SYNC.md` was read.
- `QBIZ_KHO_MASTER_DRIVER.md` was not found anywhere under `D:\`; this is a documentation gap, not permission to infer a production contract.

## Current → Target → Gap

| Area | Current | Target | Classification / smallest delta |
| --- | --- | --- | --- |
| Settings | `settings` store exists but only identity/seed values; Settings screen only has warehouses and backup. | Persisted Business Profile and structured Settings Center. | `FIX-NOW`: reuse `settings`; no new inventory contract. |
| Print | Browser `window.print()` only; no device/template/job distinction or log. | Local print center: templates, preview, Browser Print status, durable print jobs; no device bridge claim. | `NEED-MIGRATION`: additive `print_templates` and `print_jobs` stores. |
| Reports | Dashboard derives sales and inventory inline; no shared Report Center. | Common local reporting source and filters; revenue/product/inventory drill-down; only supported profit terms. | `FIX-NOW` for read-only report computations; no fake profit/debt. |
| Return/refund | No return contract/store. | Original transaction linked return; SELLABLE vs DAMAGED ledger consequence. | `NEED-CONTRACT`: do not implement against locked inventory/sync foundation in this round. |
| Shift | Device/register identity exists; no shift records. | Optional foundation, OFF by default. | `NEED-MIGRATION`: defer until SETTINGS/PRINT/REPORT P1 pass. |
| Supplier | Product fields and derived read-only supplier view exist. | Durable supplier master + source fields and receipt linkage. | `NEED-MIGRATION`: defer P2. |
| Delivery | No adapter or persisted connection; checkout warns delivery data is not persistable. | Adapter contract/config only, connector OFF, no credentials in client. | `NEED-BACKEND` for real connection; foundation is P2. |
| Channel | No adapter. | Feature-flagged interface only; no marketplace API. | `NEED-BACKEND` for real connector; foundation is P2. |
| Feature flags | No central flags. | Named flags default OFF and hide unfinished flows. | `FIX-NOW` when Settings structure is added. |

## Locked implementation order

1. SETTINGS-01 — current delta.
2. PRINT-01 — only after Settings is functionally checked.
3. REPORT-01 — only after Print is functionally checked.
4. RETURN-01 / SHIFT-01 / P2 foundations remain separately gated by their contracts.

## Delta applied in this pass

- `SETTINGS-01`: Business Profile and Sales preferences persist in the existing local `settings` store. Backup now retains settings, customer records, device/register identity and new print records.
- `PRINT-01`: additive IndexedDB v9 stores (`print_templates`, `print_jobs`), default document templates, live local preview, Browser Print capability labeling and print-job history. Browser print never calls the sale/inventory engine.
- `REPORT-01 foundation`: local Report Center reads Sale snapshots and level ledger data; Gross Sales, Discount, Net Sales, Tax, collected and receivable are separate. Product report derives from sale item snapshots; inventory report derives from levels. Profit is deliberately withheld without cost snapshots/expense ledger.
- All connector, debt, shift, e-invoice, split payment and COD reconciliation flags are explicitly OFF.

## Acceptance for SETTINGS-01

- Store profile can be opened, edited, saved and is still present after reload.
- Settings entry points are clear; unavailable connector/debt/shift/e-invoice/split-payment/COD-reconciliation flows remain hidden by OFF flags.
- Existing backup includes the settings records and restoration retains them.
- Inventory, Sales, Orders, SYNC-00 identity/outbox semantics are untouched.
