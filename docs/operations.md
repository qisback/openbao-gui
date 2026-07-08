# Operations

Running openbao-gui in production: health, updates, backup/rollback, and
troubleshooting. This is the GUI's operational surface; OpenBao's own operations are
out of scope. The estate-specific executed procedure is in
[`deploy/ROLLOUT.md`](../deploy/ROLLOUT.md).

## Health

The GUI is stateless static content. "Healthy" means:

- `GET /` returns `200` and serves `index.html`.
- `GET /config.js` returns the expected `apiBase`.
- A deep route (e.g. `/secrets/kv/`) returns `200` (SPA fallback working).

If the app loads but no data appears, the problem is almost always **CORS** or
**CSP** (see Troubleshooting), not the container.

## Updating

The GUI carries no data, so updates are just a redeploy:

```bash
git pull                       # or re-clone
docker compose up -d --build
```

`index.html` and `config.js` are served `no-store`, and `/assets/*` are
content-hashed and cached `immutable`, so a redeploy takes effect immediately
without stale-cache problems.

## Backup

The GUI itself has **nothing to back up** — no database, no volumes, no state. The
only artifacts are the source (in git) and the runtime config (from env). What must
be backed up is **OpenBao**, and only when a rollout changes OpenBao config. Before
any change that touches OpenBao (CORS, OIDC role):

```bash
# Point-in-time full state (raft):
bao operator raft snapshot save pre-change.snap
# Record the reversible config so rollback is exact:
bao read -format=json sys/config/cors
bao read -format=json auth/oidc/role/<role>
```

## Rollback

Because deploying the GUI is **additive**, rollback is removal — and the built-in
OpenBao UI at `/ui` is unaffected throughout, so operators always have a fallback.
Fastest-first:

1. **Remove the GUI** — `docker compose down`. Stops all new-GUI traffic instantly.
2. **Revert CORS** to its pre-change value (often `enabled=false` →
   `bao delete sys/config/cors`).
3. **Remove the redirect URI** from the OpenBao OIDC role and the IdP application.
4. **Remove the DNS record** for the GUI hostname.
5. **Full state restore** — only if OpenBao itself was disturbed (not expected, as
   the GUI makes no storage changes): `bao operator raft snapshot restore`.

Steps 1–4 are independent; do only as many as needed.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| App loads, all data panels empty/errored | CORS not enabled for the GUI origin | `bao write sys/config/cors enabled=true allowed_origins=… allowed_headers=…X-Vault-Token…` |
| Browser console: blocked by Content Security Policy `connect-src` | CSP doesn't list the API origin | Update `connect-src` in `nginx.conf`, redeploy |
| SSO fails with "redirect_uri not allowed" / no `auth_url` | Redirect URI not registered | Add `https://<gui>/oidc/callback` to the OIDC role `allowed_redirect_uris` **and** the IdP app |
| SSO returns to callback then errors | `client_nonce` lost (e.g. different tab) | Restart the login from the GUI so the nonce is stored |
| `401`/token rejected after a while | Token TTL expired | Sign in again; the app auto-discards invalid tokens on load |
| Deep route 404 from the proxy (not the app) | Proxy not sending unknown paths to the container | Ensure the proxy forwards all paths; the app's nginx does the SPA fallback |
| TLS error reaching the API | Browser doesn't trust the internal CA | Install the estate root CA in the browser/OS trust store |

## Metrics / logs

The GUI emits nginx access/error logs (`docker logs <container>`). It exposes no
metrics of its own; observe OpenBao for API-side metrics.
