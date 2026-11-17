# ODD Feature Document: Phase 5 — Multi-Carrier Shipping (UNAC + Shalom + Olva), 50% Separation with Partial Refund & Live Public Stock

- **Feature Identity**: `glow-with-pipo-phase5-shipping-reservations`
- **File Locator**: `odd/tasks/phase5-shipping-and-reservations.md`
- **Engram Topic Key**: `odd/phase5-shipping-and-reservations/tasks`
- **Base Commit on `origin/main`**: `9a88273` (`2026-11-16`)
- **TDD Mode**: `Strict TDD Mode: enabled` (Runner: `npm test` + `npm run build` + PGlite SQL verification)
- **Delivery Strategy**: `ask-on-risk`

## Objective & Business Rules (Approved by User 2026-11-16)
1. **Multi-Carrier Delivery Modes**:
   - `unac_pickup`: Personal delivery at UNAC / scheduled Glow points (`S/ 0`). Supports `100%` or `50%` separation advance.
   - `shalom_agency`: Agency-to-agency shipping across Peru (`S/ 0` freight prepaid — buyer pays Shalom freight at destination pickup). Requires buyer 8-digit DNI + destination city/agency. Supports `100%` product payment or `max(50%, S/ 30)` advance with 4-digit security key withheld until balance Yape arrives.
   - `olva_lima` / `olva_provincia`: Home/agency delivery via Olva Courier (`S/ 10` Lima/Callao, `S/ 20` Provincias, editable in `shipping_methods` from ERP). Requires DNI + district/city + address + reference.
2. **Two Clocks & Partial-Refund Separation Policy**:
   - **Unpaid Checkout Hold (`15 min`)**: Creating a web order sets `reservation_expires_at = now() + 15 minutes`. If unpaid after 15 min, `release_expired_web_reservations()` auto-cancels the order and returns variant stock + delivery slot capacity.
   - **Paid 50% Separation Hold**: Anchored to the selected delivery turn (or arrival window) + 24h tolerance, requiring explicit checkbox acceptance of partial-refund terms before checkout payment.
   - **No-Show / Late Cancellation Partial Refund**: Default retention `20%` of advance (`min S/ 5.00`) for UNAC handoffs, or real round-trip freight + packaging cost for agency orders, recorded cleanly in `sale_payments` (`partial_refund`) and `sales` (`refunded_amount`, `forfeited_fee_amount`) so `paymentsByMethod` cash reconciliation stays exact.
3. **Live Public Stock (`public_variant_availability`)**:
   - Privacy-safe public table (`variant_id`, `stock`, `reserved_unpaid`, `reserved_advance`, `available_stock`, zero costs/prices) published via Supabase Realtime (~80 bytes per update) so all storefront visitors see available stock and reservation badges update live.

---

## Actionable Task Checklist

### Sub-wave 5A (Parallel: Antigravity + Codex Agente B `643c`)
- [x] **P5-T1 (`Agente B` in `643c` -> `supabase/schema.sql`)**: Add `shipping_methods`, extend `customers` & `sales` & `sale_payments`, create `public_variant_availability` + Realtime trigger, implement `release_expired_web_reservations()`, upgrade `get_public_storefront_catalog()`, `create_web_storefront_order()`, `check_web_order_yape_status()`, `register_incoming_yape_notification()`, `confirm_web_order_payment_manual()`, and add `cancel_sale_with_partial_refund()` + `update_sale_carrier_dispatch()`, verified in PGlite (`f5c1c12`, cherry-picked as `e51c289`).
- [x] **P5-T2 (`Antigravity` in `scratch\glow-with-pipo-github` -> `constants.js`, `calculations.js`, `storageRepository.js`, `tests/`)**: Implement `DEFAULT_SHIPPING_METHODS` / `FULFILLMENT_STAGES`, `computeSeparationPolicy`, partial-refund cash reconciliation in `computeDashboardMetrics`, smart security-key guard in `formatSaleWhatsAppTicket`, full cloud/local mapping, `subscribePublicVariantAvailability`, `cancelSaleWithPartialRefund`, `updateSaleCarrierDispatch`, and Strict TDD unit tests (`56f9d67`, `1c32398`, `42/42` tests & Vite build green).

### Sub-wave 5B (Parallel after 5A integrates: Codex Agente A `21e8` + Agente C `7486`)
- [x] **P5-T3 (`Agente A` in `21e8` -> `StorefrontView.jsx`, `SalesView.jsx`, `StorefrontAdminView.jsx`, `App.jsx`, `styles.css`)**: Implement 3-card Delivery Selector, 100% vs 50% separation toggle with terms checkbox, 15-min hold timer, live Realtime availability badges, ERP Dispatch Queue & Tracking/4-digit-PIN modal, "Cancelar y Reembolsar Parcialmente" modal, and shipping methods tariff editor (`92c2404`, cherry-picked as `6c300a5`; Lima TZ fix `f5e0ff6`).
- [x] **P5-T4 (`Agente C` in `7486` + Antigravity)**: Full unit (`42/42`), PGlite, Vite build, headless Playwright E2E (`12/12` in `tests/e2e/phase5_ui.test.mjs` covering `360x800`/`390x844`/`1280x800` after `styles.css` radio-width fix `951c64b`), live Supabase SQL migration (`shipping_methods_count: 4`, `live_variants_count: 147`), and production GitHub Pages deployment.
