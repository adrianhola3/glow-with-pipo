# Glow with Pipo — Enterprise Resource Planning (ERP) PWA

Installable Progressive Web Application (PWA) with immediate Supabase PostgreSQL cloud persistence, multi-device Realtime WebSocket synchronization, auto-updating Service Worker, and offline-first fallback, built for **Glow with Pipo** cosmetics retail.

- **Live Web App**: [https://adrianhola3.github.io/glow-with-pipo/](https://adrianhola3.github.io/glow-with-pipo/)
- **Live Supabase Project**: `glow-with-pipo` (`fpahqojoqjrrthlwland`)

---

## Key Capabilities

1. **Direct Immediate Cloud Persistence & Realtime Multi-Device Sync**
   - Every product, variant, supplier, purchase, combo, customer, sale, and payment written immediately to Supabase PostgreSQL at row level.
   - Realtime WebSocket channels (`postgres_changes`) broadcast updates across all active owner devices in < 300ms.
   - Optimistic UI updates with automatic server rollback on network/server errors.

2. **Cosmetics Inventory & Multi-Shade Variants**
   - Handles multi-unit cosmetic boxes (e.g. 24 highlighters across 6 distinct shades of 4 units each).
   - Parent products with independent shade variants (`product_variants`), tracking stock, SKUs, and Weighted Average Cost (WAC / CPP) per shade.
   - Initial inventory tracking separated from ongoing restock spending.

3. **Restocks, Supplier Management & Weighted Average Cost (WAC / CPP)**
   - Tracks multiple suppliers with contact details, social links, and purchasing history.
   - Re-stocking batches automatically compute new Weighted Average Cost per shade without rounding drift.

4. **Combos & Flexible In-Sale Swapping**
   - Predefined combo templates (e.g. Lip combo, Eye kit) with configurable discount ratio (default 75%).
   - One-click combo expansion into cart lines, allowing swapping product X for product Y or tweaking prices on specific sales.

5. **Packaging Supplies Accounting**
   - Packaging supplies (decorated craft bags, gift envelopes) deducted automatically from inventory and absorbed into business costs, reducing net profit without charging the customer.

6. **Order Lifecycle, Scheduled Deliveries & Customer Directory**
   - Orders with WhatsApp and social media handles (TikTok, Instagram, Facebook).
   - Delivery reminder system (date, time, location) with browser alerts.
   - Shipping fee advance accounting and partial payments (Yape, Plin, Cash, Transfer).
   - Order status workflow (`pending_delivery` -> `delivered` / `cancelled` with automatic stock restoration).

7. **Auto-Updating Progressive Web App (PWA)**
   - Network-First caching strategy (`sw.js`) with instant activation (`SKIP_WAITING` + `clients.claim()`).
   - Periodic background build check against `version.json` ensuring mobile devices automatically receive updates without manual cache clearing.
   - 100% mobile responsive layout optimized for 360px–430px smartphone viewports with stacked card tables and touch-friendly controls.

---

## Architecture & Security

- **Database**: PostgreSQL 15 on Supabase Cloud.
- **Row Level Security (RLS)**: Enforced via `public.allowed_owners` whitelist and helper function `public.is_pipo_owner()`. `anon` access is fully revoked across all tables.
- **Realtime**: All 13 operational tables published to `supabase_realtime` with `REPLICA IDENTITY FULL`. Realtime client authenticates with `client.realtime.setAuth(session.access_token)`.
- **Frontend**: React 19 + Vite 6 + Lucide Icons + Native Browser Service Worker.

---

## Local Development & Testing

```bash
# Install dependencies
npm install

# Run unit & domain tests
npm test

# Start local development server
npm run dev

# Compile production build
npm run build
```

---

## Deployment

The app is automatically built and deployed to GitHub Pages via GitHub Actions upon push to `main` branch.
