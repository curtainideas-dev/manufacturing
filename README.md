# Curtain Ideas — manufacturing

The workshop app for Curtain Ideas: jobs from customer POs, their bills of
materials and cut sheets, stock, and purchase orders to suppliers.

React 19 + Vite, Supabase for data and storage, deployed on Vercel.

## Addresses

| Path | What |
|---|---|
| `/` | Home tiles |
| `/submit` | Submit a customer PO; creates a job |
| `/manufacturing/...` | The workshop app: jobs, orders, stock, components, suppliers, products, setup. Every screen has its own address (see `src/lib/route.js`) |
| `/romanblinds` | Roman blind calculator (standalone, saves nothing) |

## Running it

```bash
npm install
npm run dev
```

`.env` holds the public Supabase URL and anon key the browser uses. Note it
points at the **live** database.

## Layout

- `src/App.jsx`: owns all Supabase reads and writes and the screen state.
- `src/pages/`, `src/components/`: screens and modals (presentational).
- `src/lib/`: the engines (`bomEngine`, `stockEngine`, `poEngine`, `sellEngine`,
  `fabricEngine`, `cutPlan`) and the PDF/label/Excel exports.
- `api/`: the one serverless endpoint (portal "new job" email). See
  `docs/NOTIFICATIONS.md`.
- `supabase/migrations/`: schema changes, applied with the Supabase CLI.
  Older hand-run scripts are in `supabase/legacy/`.
