# Deploying TorBook backend on Render

## Quick fix for "SHARED_SERVICE_URL is required"

The API **cannot run alone**. Login/register call three private services:

| Env var on `torbook-api` | Private service |
|--------------------------|-----------------|
| `SHARED_SERVICE_URL` | `torbook-shared` |
| `DB_SERVICE_URL` | `torbook-db` |
| `AUTH_SERVICE_URL` | `torbook-auth` |

### Option 1 — Full Blueprint (recommended)

1. Render Dashboard → **Blueprints** → **New Blueprint Instance**
2. Connect your repo and set **Root Directory** to `backend`
3. Render reads `backend/render.yaml` and creates all services
4. Fill in secrets marked `sync: false` in the Dashboard (same value for `INTERNAL_SERVICE_SECRET` on every service):

| Service | Required secrets |
|---------|------------------|
| `torbook-api` | `INTERNAL_SERVICE_SECRET`, `REDIS_URL`, `CORS_ORIGIN` |
| `torbook-shared` | `INTERNAL_SERVICE_SECRET`, `AES_ENCRYPTION_KEY` |
| `torbook-db` | `INTERNAL_SERVICE_SECRET`, `DATABASE_URL` |
| `torbook-auth` | `INTERNAL_SERVICE_SECRET`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` |

5. Set `CORS_ORIGIN` on `torbook-api` to `https://torbook122.github.io`

Service URLs (`SHARED_SERVICE_URL`, etc.) are wired automatically via `fromService: hostport`. The code adds `http://` when needed.

### Option 2 — Manual env vars (existing API service only)

If you already have `backend-4u2b` as a standalone web service:

1. Deploy `torbook-shared`, `torbook-db`, and `torbook-auth` as **Private Services** from their Dockerfiles
2. On each private service → **Connect** → **Internal** — copy the internal address (e.g. `torbook-shared-ab12:3002`)
3. On `torbook-api` → **Environment**, add:

```
SHARED_SERVICE_URL=http://<internal-address-of-shared>
DB_SERVICE_URL=http://<internal-address-of-db>
AUTH_SERVICE_URL=http://<internal-address-of-auth>
INTERNAL_SERVICE_SECRET=<same secret on all services>
REDIS_URL=<Render Redis or external Redis URL>
CORS_ORIGIN=https://torbook122.github.io
```

4. Redeploy `torbook-api`

## Frontend

Set GitHub Actions variable:

```
NEXT_PUBLIC_API_URL=https://backend-4u2b.onrender.com/api/v1
```

## Verify

After deploy, logs should show `TorBook API listening on port 3001` with **no** startup error about missing env vars. Login should return 401 for wrong credentials (not 500).
