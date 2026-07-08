# Deployment

openbao-gui ships as a static site in an nginx container, fronted by a reverse proxy
that terminates TLS. This guide is the general pattern; the exact, executed
procedure for an OpenBao estate (with backup and rollback) is in
[`deploy/ROLLOUT.md`](../deploy/ROLLOUT.md).

## Image

[`Dockerfile`](../Dockerfile) is multi-stage:

1. **build** — `node:22-alpine`, `npm ci`, `npm run build` → `dist/`.
2. **runtime** — `nginx:1.27-alpine` serving `dist/`, with:
   - [`nginx.conf`](../nginx.conf) — SPA fallback, cache rules, security headers.
   - [`docker-entrypoint.sh`](../docker-entrypoint.sh) — renders `/config.js` from
     env at start (installed into nginx's `/docker-entrypoint.d`).

```bash
docker build -t openbao-gui:latest .
```

## Run

The simplest run, same-origin behind your own proxy:

```bash
docker run -d --name openbao-gui \
  -e BAO_ADDR=https://openbao.example \
  -e OIDC_MOUNT=oidc -e OIDC_ROLE=operator \
  -p 8080:80 openbao-gui:latest
```

Or use [`docker-compose.yml`](../docker-compose.yml), which adds Traefik labels for
the estate (step-ca TLS on the shared `lab_net`). The GUI is a pure API client and
holds no secrets, so there is **no OpenBao agent sidecar**.

## Reverse proxy

The container listens on plain HTTP `:80`; your proxy terminates TLS and forwards to
it. The compose file's Traefik labels publish it at a dedicated hostname with a
`stepca` certificate resolver. Any proxy works — the requirements are: TLS
termination, forward to container `:80`, and a hostname distinct from the OpenBao
API hostname.

## CORS

Because the GUI and the OpenBao API are on different hostnames, browser calls are
**cross-origin** and OpenBao must allow them:

```bash
bao write sys/config/cors \
  enabled=true \
  allowed_origins="https://bao.example" \
  allowed_headers="X-Vault-Token,Content-Type,X-Requested-With,Authorization,X-Vault-Wrap-TTL"
```

- `allowed_origins` must be the **GUI** origin (not the API origin).
- `allowed_headers` must include `X-Vault-Token`.
- If you serve the GUI same-origin with the API (e.g. behind one proxy that routes
  `/v1` to OpenBao and everything else to the GUI), CORS is not needed — but that is
  not the default deployment.

Also update the CSP `connect-src` in [`nginx.conf`](../nginx.conf) to the OpenBao API
origin you use, or the browser blocks the calls.

## OIDC prerequisites

For SSO, register the GUI callback `https://<gui-origin>/oidc/callback` in both the
OpenBao OIDC role (`allowed_redirect_uris`) and the IdP application. See
[Authentication](authentication.md#prerequisites-for-oidc-to-work) and the
[rollout runbook](../deploy/ROLLOUT.md).

## Verify a deployment

```bash
curl -sk https://<gui-origin>/ -o /dev/null -w "gui %{http_code}\n"     # 200
curl -sk https://<gui-origin>/config.js                                 # apiBase set correctly
curl -sk https://<gui-origin>/secrets/kv/ -o /dev/null -w "spa %{http_code}\n"  # 200 (SPA fallback)
# CORS preflight from the GUI origin must be allowed:
curl -sk -X OPTIONS https://<api-origin>/v1/sys/seal-status \
  -H "Origin: https://<gui-origin>" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-vault-token" -D - -o /dev/null | grep -i access-control
```

Then open the GUI, sign in (SSO round-trips through the IdP), and confirm the
dashboard shows seal status.
