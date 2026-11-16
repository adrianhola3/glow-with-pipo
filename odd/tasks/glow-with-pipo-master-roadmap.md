# ODD Feature Document: Glow with Pipo — Master Roadmap (Security, Performance, Architecture & ERP Evolution)

- **Feature Identity**: `glow-with-pipo-master-roadmap`
- **File Locator**: `odd/tasks/glow-with-pipo-master-roadmap.md`
- **Engram Topic Key**: `odd/glow-with-pipo-master-roadmap/tasks`
- **Base Commit on `origin/main`**: `ddb18c078ab1c98f337c4af53910531d5e513f2f` (`2026-11-16`)
- **Unified Candidate Branch**: `feat/phase1-adapter-and-ci-security` (`54404a0`) in `C:\Users\User\.gemini\antigravity\brain\4d4b6930-ed55-4ee6-893a-254a947c8c3c\scratch\glow-with-pipo-github`
- **TDD Mode**: `Strict TDD Mode: enabled` (Runner: `npm test` -> **38/38 passing**, `npm run build` -> **0 warnings, main chunk 393.19 kB**)
- **Delivery Strategy**: `ask-on-risk` (400-line heuristic per work-unit slice)

## Objective & Problem
Upgrade `adrianhola3/glow-with-pipo` from its current prototype state on GitHub (`ddb18c0`) into a secure, high-performance, modular, production-grade Cosmetics ERP & Public E-Commerce Storefront. Coordinate execution across **Codex Orchestrator (`Orquestador · Glow With Pipo` -> Agente A, Agente B, Agente C)** and **Antigravity (Supervisor & Lead Architect)** with strict file-ownership boundaries and zero regression.

## Constraints
- Never overwrite or touch uncommitted changes in `C:\Users\User\Desktop\Glow with Pipo`. Work strictly in isolated worktrees branched from `origin/main` (`ddb18c0`).
- Never reset or modify production credentials in Supabase Auth.
- Zero mouse/keyboard interference on the user's desktop: communicate with Codex exclusively via the `\\.\pipe\codex-app-tools-*` Named Pipe IPC bridge and run all browser checks headlessly.

---

## Actionable Task Checklist (11/11 Completed & Verified)

### Phase 1: Critical Security, Stock/Price Integrity & Active Bugfixes
- [x] **T1 (Codex Agente B `643c` + Agente C `7486`)**: **SQL & Payment/Order RPC Hardening (`supabase/schema.sql` + Automate Pilot Integration)** — **COMPLETED (`f933e7c`, `db81628`, `99b883b`, `ed5356c`, `c1c3922`, PGlite + `38/38` tests pass)**
  - Revoked `EXECUTE` from `anon` on `register_incoming_yape_notification` and `ingest_yape_android_webhook`; restricted manual simulation/registration to `public.is_pipo_owner()` or `service_role`.
  - Fixed client price tampering in `create_web_storefront_order`: computes combo item prices strictly from `prod_row.combo_price` on the server, ignoring client-supplied `appliedUnitPrice`.
  - Fixed multi-line stock validation bypass in `create_web_storefront_order`: aggregates total requested quantity per `variant_id` across the entire order payload before checking `var_row.stock < total_qty` with `FOR UPDATE`.
  - Protected existing customer names in `create_web_storefront_order`: never overwrites `customers.name` from anonymous web orders when the phone number already exists with a non-empty name.
  - Added `confirm_web_order_payment_manual(target_sale_id uuid)` (`SECURITY DEFINER`, guarded by `public.is_pipo_owner()`) so 1-click admin approval works regardless of the 20-minute auto-match window.
  - Integrated the Automate Yape notification pilot (`supabase/functions/yape-notification/*`, `supabase/migrations/20261116010000_automate_notification_inbox.sql`, `tests/automate_notifications.test.js`) cleanly onto `ddb18c0`.
- [x] **T2 (Codex Agente A `21e8` + Agente C `7486`)**: **Storefront & Admin UI Bugfixes (`StorefrontView.jsx`, `StorefrontAdminView.jsx`, `styles.css`)** — **COMPLETED (`3295b37`)**
  - Fixed `zone_type` mismatch: uses `'unac'` instead of `'universidad'` in `StorefrontAdminView.jsx` (`L47`, `L197`, `L406`) and handles both `'unac'` and `'universidad'` in `StorefrontView.jsx` (`getZoneLabel`).
  - Unified `pricingMode` to `'unit'` when adding single items from the product detail modal (`StorefrontView.jsx`) so identical items merge in the cart, and persisted `cart` in `localStorage` (`glow_with_pipo_cart_v1`).
  - Capped combo quantity (`detailQty`) in the Combo Detail Modal (`detailComboMaxQty`) to available component stock minus quantities already in the cart.
  - Defined `--pipo-border` and `--pipo-rose` in `:root` (`src/styles.css:1-3`).
  - Wired the `"Confirmar Yape Recibido (1 clic)"` button in `StorefrontAdminView.jsx` to direct order confirmation by `sale.id` (`onConfirmWebOrderManual`).
- [x] **T3 (Antigravity)**: **Adapter Stock/Slot Restoration, Session Boundary Fix & Public Repo Backup Safety (`src/adapters/storageRepository.js`, `.github/workflows/cloud-backup.yml`, `tests/`)** — **COMPLETED (`8c4c774`)**
  - Restored absorbed supply stock (`sale_supplies` -> `supplies.stock`) in `cloudDeleteSale` and `cloudDeleteCustomer` to match local `applyDeleteSale` / `applyDeleteCustomer`.
  - Released booked delivery slots (`delivery_slots.booked_orders = greatest(0, booked_orders - 1)`) when a web order is cancelled or deleted in both local and cloud mutations.
  - Added `confirmWebOrderManual(saleId)` and `applyConfirmWebOrderManual` in `storageRepository.js`.
  - Fixed inactivity session boundary check (`>=` vs `>`) in `isSessionExpired` / `isSessionExpiredByInactivity`.
  - Secured `.github/workflows/cloud-backup.yml` so it never commits/pushes customer PII or financial JSON dumps into the public Git repository (uploads as workflow artifact instead).

### Phase 2: Media Storage, Performance & Code-Splitting
- [x] **T4 (Antigravity)**: **Client-Side WebP Compression + Supabase Storage Bucket (`storefront-media`)** — **COMPLETED (`97da594`)**
  - Replaced raw Base64 SQL uploads in `StorefrontAdminView.jsx` with client-side Canvas WebP compression (`<= 1200px`, quality `0.82`) and upload to Supabase Storage bucket `storefront-media` (`src/adapters/mediaStorage.js`), plus SQL bucket/RLS provisioning in `supabase/schema.sql`.
- [x] **T5 (Codex Agente A `21e8`)**: **Route-Level Code-Splitting (`React.lazy`) & Polling Optimization (`src/App.jsx`)** — **COMPLETED (`64832da`)**
  - Lazy-loaded ERP admin views (`InventoryView`, `SalesView`, `RestocksView`, `StorefrontAdminView`, `DashboardView`, `SettingsView`) with `<Suspense>`, eliminating the `>500 kB` Vite chunk warning (main bundle reduced from `535.17 kB` to `393.19 kB`) and wired `handleConfirmWebOrderManual`.
  - Reduced `/version.json` polling interval from 20s to 5 minutes (`300000` ms) + `visibilitychange`.
- [x] **T6 (Antigravity)**: **LocalStorage Quota Protection (`storageRepository.js`)** — **COMPLETED (`6aacddf`)**
  - Stripped inline Base64 data URLs (`stripBase64ImagesFromDb`) from rotating auto-snapshots (`glow_pipo_backup_auto_*`) and added automatic recovery when `localStorage.setItem` throws `QuotaExceededError`.

### Phase 3: Architectural Modularization (Decomposing God Files)
- [x] **T7 (Codex Agente A `21e8`)**: **Decompose `StorefrontView.jsx`** — **COMPLETED (`64832da`)**
  - Extracted the expanded Product and Combo Detail Modals (~540 lines) into `src/features/storefront/StorefrontDetailModals.jsx`.
- [x] **T8 (Antigravity)**: **Modularize Media Storage Out of `storageRepository.js`** — **COMPLETED (`97da594`)**
  - Extracted image compression, dimension calculation, and Supabase Storage upload logic into `src/adapters/mediaStorage.js` while re-exporting a 100% backward-compatible facade from `storageRepository.js`.

### Phase 4: Professional Cosmetics ERP Features & Social SEO
- [x] **T9 (Codex Agente B `643c` + Antigravity)**: **Date-Range Filtering & Cash Reconciliation by Payment Method in Dashboard (`calculations.js`, `DashboardView.jsx`)** — **COMPLETED (`29b1d58`, `54404a0`)**
  - Added period filtering (`all`, `month`, `7d`, `today`) to `computeDashboardMetrics` and `DashboardView.jsx`, plus `paymentsByMethod` reconciliation (`Yape`, `Plin`, `Efectivo`, `Transferencia`) and `totalUnitsSold`.
- [x] **T10 (Codex Agente B `643c` + Antigravity)**: **Digital WhatsApp Order Ticket & Separate Shipping Cost (`SalesView.jsx`, `calculations.js`)** — **COMPLETED (`29b1d58`, `54404a0`)**
  - Added `formatSaleWhatsAppTicket` and a 1-click WhatsApp ticket copy button on each order card in `SalesView.jsx`, plus separate optional `shippingCost` vs `shippingCharged`.
- [x] **T11 (Codex Agente A `21e8`)**: **OpenGraph Meta Tags, Asset Compression (`yape-logo.png`) & Deep-Link Product URLs (`?product=SKU`)** — **COMPLETED (`64832da`)**
  - Optimized `public/yape-logo.png` from **257 KB down to 12.9 KB**, added OpenGraph & Twitter Card social preview meta tags to `index.html`, and implemented `?product=<sku_or_id>` and `?combo=<code_or_id>` deep-linking in `StorefrontView.jsx`.
