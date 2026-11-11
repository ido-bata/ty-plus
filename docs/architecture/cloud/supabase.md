# Supabase

This document defines the Supabase implementation currently in the repo for
ty-plus online functionality.

## Source Authority

Cloud client implementation is under `src/management/online/`. The `supabase/`
directory in the repo root contains Supabase project configuration (migrations,
edge functions).

## Environment Variables

Client-side:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_ANON_KEY` (legacy fallback)
- `TY_PLUS_API_BASE`
- `TY_PLUS_MEDIA_BASE_URL`

Edge-side:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or publishable/anon
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_ANON_KEY`
- `SYNC_TOKEN` / `TY_PLUS_SYNC_TOKEN`
- `TY_PLUS_PRESET_BUCKET`

## Current Contract

- Remote mode base URL is `${SUPABASE_URL}/functions/v1/typlus` (Supabase edge function URL path, not legacy `functions/` source path)
- Edge function endpoints: `health`, `presets/search`, `presets/:id`,
  `download`, `upload-url`, `reports`, `notifications`,
  `notifications/:id/blocks`, `admin/sync/presets`
- If DB and service role are not configured, the edge function operates as
  an in-memory fixture

## Implementation Status

- Both client and edge exist in the repo, so the design surface is defined
- Product value requires remote deployment and migrations, not fixture mode
- Design is complete; operational value requires Supabase project setup and
  deployment

## Scope of This Document

- Endpoint shapes are in the implementation paths
- Business promises are in [`../project.md`](../project.md)
- Online/offline behavior is in [connectivity.md](connectivity.md)