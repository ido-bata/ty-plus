# NET-001: Network Calls Inventory

## Summary

Total network-related files: 20+
Direct `fetch()` calls: 2 locations
API endpoints: 13+ Edge functions
Authentication: API key + Bearer token

## Direct Network Calls

### 1. Preset Download (use-cases.ts:340)
```typescript
const response = await globalThis.fetch(url);
```
- Downloads preset binary files
- SHA-256 integrity verification
- Progress streaming support

### 2. Edge Function Calls (gateway.ts:628-629)
```typescript
const callEdge = async (path: string, init?: RequestInit) => {
  return fetch(`${config.apiBase}${path}`, {
    ...init,
    cache: "no-store",
  });
};
```
- All 13 API methods use this wrapper
- Auth headers: `apikey` + `Authorization: Bearer`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/preset/search` | GET | Search presets |
| `/presets/:id/download` | GET | Get download URL |
| `/presets/:id/upload-url` | GET | Get upload URL |
| `/reports` | POST | Submit report |
| `/presets` | GET | List presets |
| `/presets/:id` | GET/PUT/DELETE | CRUD preset |
| `/notifications` | GET | List notifications |
| `/notifications/:id/blocks` | GET | Get notification blocks |
| `/public-links/:key` | GET | Get public link |

## Authentication

- **API Key**: `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`
- **Bearer Token**: Same as API key
- **Headers**: `apikey`, `Authorization`, `Accept`, `Content-Type`

## Error Handling

- Response validation: `response.ok` check
- JSON parsing with shape validation
- Secret redaction in error messages
- 404 special handling for some endpoints

## Retry/Timeout

- **No automatic retry/backoff**
- `RequestCancellation` class for abort support
- `cache: "no-store"` on all requests

## Files to Cutover to Rust

| File | Lines | Priority | Notes |
|------|-------|----------|-------|
| `gateway.ts` | 940 | High | Core HTTP client |
| `use-cases.ts` | 521 | High | Download logic |
| `contract.ts` | 130 | Medium | API types |
| `env.ts` | 92 | Low | Config (build-time) |
| `sync.ts` | 83 | Medium | Cloud sync |
| `sanitize-error.ts` | 13 | Low | Error handling |
