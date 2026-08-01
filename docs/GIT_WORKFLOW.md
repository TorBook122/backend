# Git workflow — develop → staging → main

Cross-repo git flow for KvaTor. Backend and frontend are separate GitHub repos with paired branch names. **Railway Staging** deploys manually after merge to `*_staging`; **Railway Production** auto-deploys from `main` after CI passes.

## Branch flow

```mermaid
flowchart LR
  feature["feature/*"] -->|"commit + push, no CI"| localPush[Local only]
  feature -->|"PR"| devlope["*_devlope"]
  devlope -->|"required: repo CI"| mergeDev[Merge]
  devlope -->|"e2e soft, non-blocking"| e2eSoft[E2E background]
  mergeDev -->|"PR"| staging["*_staging"]
  staging -->|"required: CI + full e2e"| mergeStg[Merge]
  mergeStg -->|"manual Railway deploy"| rwStg[Railway Staging]
  mergeStg -->|"manual QA on live staging"| qa[Manual QA]
  qa -->|"PR"| mainBr[main]
  mainBr -->|"required: CI + full e2e"| mergeMain[Merge]
  mergeMain -->|"Railway Wait for CI"| rwProd[Railway Production]
```

### Branch names

| Repo | Develop | Staging | Production (git line) |
|------|---------|---------|------------------------|
| Backend | `backend_devlope` | `backend_staging` | `main` |
| Frontend | `frontend_devlope` | `frontend_staging` | `main` |

Spelling stays **`devlope`** (not `develop`). Feature branches (`feature/*`) are not CI-gated on push.

## CI rules by gate

| Gate | Trigger | Backend / frontend CI | E2E |
|------|---------|----------------------|-----|
| Feature push | `feature/*` | none | none |
| PR → `*_devlope` | PR into develop | **required** | runs as **`e2e-soft`**, does **not** block merge |
| PR → `*_staging` | PR develop → staging | **required** | **required** (`e2e`) |
| PR → `main` | PR staging → main | **required** | **required** (`e2e`) |
| Push to `*_staging` | after merge | CI runs; **manual** Railway Staging deploy | — |
| Push to `main` | after merge | CI green → Railway Production auto-deploy | — |

Workflow locations:

- Backend CI: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- Frontend CI: `TorBook122/frontend` → `.github/workflows/ci.yml`
- E2E (backend): [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)
- E2E (frontend mirror): `TorBook122/frontend` → `.github/workflows/e2e.yml`

## Day-to-day developer path

1. `git checkout -b feature/my-change` from latest `*_devlope`
2. Commit + push — no CI on feature branches
3. Open PR → `*_devlope` — wait for repo CI; e2e-soft may fail without blocking
4. Open PR `*_devlope` → `*_staging` — full CI + e2e must pass → **manually deploy** both Railway Staging services (backend + frontend)
5. Manual QA on live staging
6. Open PR `*_staging` → `main` — full CI + e2e again → Railway Production auto-deploys after Wait for CI

## PR checklist

Before merging to `*_staging`:

- [ ] Repo CI (`ci`) green
- [ ] E2E (`e2e`) green
- [ ] Paired repo branch is in sync if the change is cross-cutting (API + UI)
- [ ] Enum sync passes on frontend if backend enums changed

After merging to `*_staging`:

- [ ] Manually deploy backend + frontend on Railway Staging (Dashboard → Deploy, or `railway up` on the staging service)

Before merging to `main`:

- [ ] Staging QA completed on Railway Staging URLs
- [ ] CI + e2e green on both repos (if both changed)

---

## Manual dashboard checklist

These settings live in Railway and GitHub — they cannot be enforced from git alone.

### Railway Staging (backend + frontend services)

Apply to **both** Railway staging services (backend monolith + frontend static site):

| Setting | Value |
|---------|--------|
| Connected branch | `backend_staging` / `frontend_staging` respectively |
| Autodeploy | **OFF** |
| Wait for CI | **OFF** (not used while autodeploy is off) |
| Deploy trigger | **Manual** after merge to `*_staging` (Railway Dashboard → Deploy, or CLI) |

CI still runs on push to `*_staging`; deploy is a separate manual step once checks are green.

### Railway Production (backend + frontend services)

Apply to **both** Railway production services:

| Setting | Value |
|---------|--------|
| Connected branch | `main` (both repos) |
| Autodeploy | **ON** |
| Wait for CI | **ON** (deploy only after GitHub `ci` check passes) |

After merge to `main`, Railway waits for required checks, then builds and deploys automatically.

### GitHub branch protection

Configure separately in **TorBook122/backend** and **TorBook122/frontend**.

#### `*_devlope` branches

| Setting | Value |
|---------|--------|
| Require pull request before merging | Yes |
| Required status checks | **`ci`** only |
| Do **not** require | `e2e-soft` |
| Allow direct push | No (prefer PR merges) |

#### `*_staging` and `main` branches

| Setting | Value |
|---------|--------|
| Require pull request before merging | Yes |
| Required status checks | **`ci`** + **`e2e`** |
| Do **not** require | `e2e-soft` (only runs on devlope PRs) |
| Allow direct push | No |

### Check names reference

| Check name | Workflow | Required on |
|------------|----------|-------------|
| `ci` | `ci.yml` | `*_devlope`, `*_staging`, `main` |
| `e2e-soft` | `e2e.yml` (soft job) | nowhere (informational only) |
| `e2e` | `e2e.yml` (hard job) | `*_staging`, `main` |

Frontend PRs into `frontend_staging` / `main` run E2E via the frontend repo workflow, which calls [`.github/workflows/e2e-reusable.yml`](../.github/workflows/e2e-reusable.yml) against the paired backend branch.

### Out of scope (this phase)

- Renaming `devlope` → `develop`
- Collapsing backend and frontend into one monorepo
- Removing Render Blueprint config (docs updated; infra migration is separate)

## Further reading

- [`docs/DEPLOY.md`](DEPLOY.md) — backend Railway staging and production
- Frontend sync: `TorBook122/frontend` → `docs/SYNC.md`
