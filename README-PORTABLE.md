# LikeLink Portable Runtime

This branch adds a provider-neutral Node entrypoint for the existing API handlers.
It does not create a second database, change Supabase/KV, change PayPal logic, or
remove the existing deployment adapter.

## Target

- React/Vite frontend: static `dist/`
- Existing `api/*.mjs`: business/API layer
- `server/portable.mjs`: portable HTTP adapter
- Supabase: existing data/auth/storage source of truth
- PayPal/social/AI providers: external adapters, not hosting dependencies

## Safety

`vercel.json` remains untouched until a portable deployment is actually verified.
No database migration or cron-frequency change is included by this branch.
