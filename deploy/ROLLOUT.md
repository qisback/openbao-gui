# Rollout — deploying openbao-gui alongside a live OpenBao

This deploys the GUI **additively** next to a running OpenBao. The built-in UI at
`/ui` is never touched, so rollback is always available. See
[`docs/deployment.md`](../docs/deployment.md) for the general deployment guide and
[`docs/operations.md`](../docs/operations.md) for backup/rollback/troubleshooting.

Placeholders: `<gui-origin>` (e.g. `https://bao.example`), `<api-origin>` (e.g.
`https://openbao.example`), `<idp>` (your OIDC provider), `<openbao-host>`,
`<docker-host>`.

## What changes (all additive + reversible)

1. **DNS**: `<gui-origin>` hostname → your ingress/reverse proxy.
2. **IdP**: add the redirect URI `<gui-origin>/oidc/callback` to the OpenBao OIDC
   application.
3. **OpenBao OIDC role**: append the same URI to `allowed_redirect_uris`.
4. **OpenBao CORS**: enable and allow the GUI origin + `X-Vault-Token` header.
5. **Container host**: run the `openbao-gui` container behind your reverse proxy.

Nothing in OpenBao's storage, seal, policies or secrets is modified.

## 0. Backup first

If a step will change OpenBao config, snapshot state and record the reversible
config so rollback is exact:

```bash
bao operator raft snapshot save pre-gui.snap      # point-in-time full state
bao read -format=json sys/config/cors             # record current CORS
bao read -format=json auth/oidc/role/<role>       # record current redirect URIs
```

Restore (if ever needed): `bao operator raft snapshot restore pre-gui.snap`.

## 1. DNS

Point `<gui-origin>` at your reverse proxy.

## 2. IdP — add the redirect URI

Add `<gui-origin>/oidc/callback` to your OpenBao OIDC application's allowed
redirect URIs.

## 3. OpenBao OIDC role — allow the redirect URI

```bash
bao write auth/oidc/role/<role> \
  allowed_redirect_uris="<existing-uris>,<gui-origin>/oidc/callback" \
  user_claim="..." groups_claim="..." oidc_scopes="openid,profile,email" \
  bound_audiences="<client-id>" token_policies="..."
```

(Keep the existing URIs; only append. Preserve the other role fields — read them
from the backup in step 0.)

## 4. OpenBao — enable CORS for the GUI origin

```bash
bao write sys/config/cors \
  enabled=true \
  allowed_origins="<gui-origin>" \
  allowed_headers="X-Vault-Token,Content-Type,X-Requested-With,Authorization,X-Vault-Wrap-TTL"
```

## 5. Deploy the container

```bash
docker compose up -d --build      # see docker-compose.yml
```

Set `BAO_ADDR=<api-origin>` (and `OIDC_MOUNT`/`OIDC_ROLE`) in the environment.

## 6. Verify

```bash
curl -sk <gui-origin>/ -o /dev/null -w "gui %{http_code}\n"        # 200
curl -sk <gui-origin>/config.js                                    # apiBase set
curl -sk -X OPTIONS <api-origin>/v1/sys/seal-status \
  -H "Origin: <gui-origin>" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-vault-token" -D - -o /dev/null | grep -i access-control
```

Then sign in via SSO in a browser and confirm the dashboard shows seal status.

## Rollback

Fastest first; the built-in `<api-origin>/ui` is unaffected and is the fallback.

1. **Remove the GUI**: `docker compose down`.
2. **Revert CORS** to its pre-change state (often `bao delete sys/config/cors`).
3. **Remove the redirect URI** from the OpenBao role and the IdP application.
4. **Remove the DNS record**.
5. **Full state restore** only if OpenBao itself was disturbed (not expected):
   `bao operator raft snapshot restore pre-gui.snap`.

Steps 1–4 are independent; do only as many as needed.
