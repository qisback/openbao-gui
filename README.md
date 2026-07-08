# openbao-gui

A modern, self-hosted web GUI for [OpenBao](https://openbao.org), built with
**React + TypeScript + Vite**. It is a standalone single-page app that talks
directly to the OpenBao HTTP API, deployed alongside (not inside) the OpenBao
server. This mirrors the direction of OpenBao's own
[RFC #1364 — Web UI Modernization](https://github.com/openbao/openbao/issues/1364),
which proposes replacing the EmberJS UI with a decoupled React/TypeScript app.

The built-in OpenBao UI at `/ui` is left completely untouched, so this GUI is
**additive** and the built-in UI remains as an instant fallback.

## Features

- **Authentication**
  - **SSO / OIDC** (the estate's primary path — authentik) with the full
    `auth_url` → redirect → `callback` exchange
  - **Token** login (any policy-bound token, incl. root)
  - **Userpass** login
- **Dashboard** — seal state, HA/raft status, version, storage, mount counts,
  and your own token/identity. Every panel is 403-tolerant.
- **Secrets** — browse and manage KV engines (enable/disable); full CRUD for
  **KV v2** (versioned: read any version, write, delete, version history) and
  **KV v1**; JSON/table toggle, per-field copy, key filter; capability-aware
  (Edit/Delete hidden when the token can't).
- **Auth methods** — list, enable and disable backends.
- **AppRole** — manage roles, read `role_id`, generate/destroy `secret_id`s.
- **Policies** — list, view, create, edit and delete ACL policies (HCL).
- **Access** — create/edit/delete identity entities and groups (incl. external
  group → policy mappings).
- **Tokens & Leases** — create/lookup/revoke tokens; browse and revoke leases.
- **Raft storage** — peers, autopilot health, **snapshot download**, remove peer.
- **Audit devices** — list, enable (file/syslog), disable.
- **Seal / Unseal** — live seal status, submit Shamir unseal shares with
  progress, and (guarded) seal the instance.

Token lives in `sessionStorage` only (cleared when the tab closes) and is sent
as `X-Vault-Token`; sessions auto-renew a renewable token and auto-logout after
idle. A light/dark theme toggle is in the top bar.

## Documentation

Full docs are in [`docs/`](docs/README.md):

- [Architecture](docs/architecture.md) — how it's built, the request flow, security model
- [Configuration](docs/configuration.md) — runtime `config.js` / env settings
- [Authentication](docs/authentication.md) — Token, Userpass and OIDC/SSO flows
- [Features](docs/features.md) — page-by-page reference
- [API client](docs/api-client.md) — the OpenBao endpoints used
- [Development](docs/development.md) — local setup and how to extend
- [Deployment](docs/deployment.md) — image, reverse proxy, CORS, OIDC prerequisites
- [Operations](docs/operations.md) — health, updates, backup/rollback, troubleshooting

See also [CONTRIBUTING](CONTRIBUTING.md) and the [CHANGELOG](CHANGELOG.md).

## Configuration (runtime)

The app reads `window.OPENBAO_GUI_CONFIG` from `/config.js`, which the container
entrypoint renders from environment variables — so one image works against any
OpenBao without a rebuild:

| Env var | Meaning | Default |
|---------|---------|---------|
| `BAO_ADDR` | Base URL of the OpenBao API (`''` = same origin, dev proxy) | `''` |
| `OIDC_MOUNT` | OIDC auth mount path | `oidc` |
| `OIDC_ROLE` | OIDC role to log in with | `operator` |

## Local development

```bash
npm install
BAO_ADDR=https://openbao.example npm run dev   # Vite proxies /v1 -> BAO_ADDR (no CORS)
```

Open http://localhost:5173.

## Build

```bash
npm run build      # type-check + Vite production build into dist/
```

## Deploy

Container + Traefik stack in `docker-compose.yml`; full estate rollout, backup
and rollback procedure in [`deploy/ROLLOUT.md`](deploy/ROLLOUT.md). Because the
SPA and the API are on different hostnames, OpenBao needs CORS enabled and the
new SSO redirect URI registered — both are additive and reversible, documented
in the rollout guide.

## Scope / roadmap

v0.1 covers feature parity for the common operator workflows above, including
mount and auth method management, audit devices, tokens and leases, and identity
entities and groups. Not yet covered (tracked for later): fine-grained mount
tuning (enable and disable are done, per-mount tune is not); the transit, PKI and
database dynamic-credential engine UIs; and the sandboxed plugin system proposed
in RFC #1364. The theme is a custom dark design system rather than Material
Design. See [`TODO.md`](TODO.md) for the working checklist.
