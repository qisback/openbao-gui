# Changelog

All notable changes to openbao-gui are recorded here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-07-08

### Security
- Deep security audit (see [SECURITY.md](SECURITY.md)); fixes applied:
  - **OIDC `state` validation** on the callback (login-CSRF / session-fixation).
  - **Server-side token revoke** (`revoke-self`) on logout and idle-logout; an
    **8 h absolute session cap**.
  - **Hardened CSP** (dropped `style-src 'unsafe-inline'`; added `object-src`/
    `frame-src 'none'`, `form-action 'self'`), **HSTS**, and **Permissions-Policy**;
    `connect-src` now templated from `BAO_ADDR` at deploy.
  - **Clipboard auto-clear** (45 s) when copying secrets.
  - Dev proxy no longer defaults to production and binds `127.0.0.1`; entrypoint
    validates/escapes env; `esbuild` pinned to a patched release; API path
    segments URL-encoded; `autocomplete=off` on token/unseal/password inputs;
    production console logging removed.

### Added
- **Login-page version badge** — the running release version (from `package.json`,
  injected at build time) is shown on the sign-in screen.
- **Tools** page: response-wrapping unwrap/lookup/rewrap, random-bytes, and hash.
- **Secrets-engine, auth-method and audit management** — enable/disable KV engines
  and auth methods; new Audit devices page (file/syslog).
- **AppRole management** — roles, `role_id`, generate/destroy `secret_id`s.
- **Tokens & leases** — create/lookup/revoke tokens; browse/revoke leases.
- **Raft storage** — peer set, autopilot health, snapshot download, remove peer.
- **Identity writes** — create/edit/delete entities and groups (incl. external
  group → policy mappings).
- **KV power features** — JSON/table toggle, per-field copy, key filter, JSON edit
  mode; capability-aware Edit/Delete via `sys/capabilities-self`.
- **Session hardening** — idle auto-logout and renewable-token auto-renew.
- **UI quality** — light/dark theme toggle, render error boundary, mobile sidebar.
- Full documentation set under `docs/` (architecture, configuration,
  authentication, features, API client, development, deployment, operations) plus
  `CONTRIBUTING.md` and this changelog.

## [0.1.0] — 2026-07-08

Initial release: a standalone React + TypeScript + Vite web GUI for OpenBao,
deployed alongside the server (not embedded), aligned with OpenBao RFC #1364.

### Added
- **Authentication**: OIDC/SSO (full `auth_url` → callback exchange), token, and
  userpass. Token held in `sessionStorage`, sent as `X-Vault-Token`; auto-validated
  and auto-discarded when invalid.
- **Dashboard**: seal/HA/raft status, version, storage, mount and auth-method
  counts, and the caller's own token — every panel 403-tolerant.
- **Secrets**: KV engine browser with full CRUD for KV v2 (versioned: read any
  version, write, delete, version history) and KV v1; reveal/hide values.
- **Auth methods**: list of enabled backends.
- **Policies**: list, view, create, edit and delete ACL policies (HCL).
- **Access**: identity entities and groups (read).
- **Seal / Unseal**: live status, submit Shamir unseal shares with progress, and a
  guarded seal action.
- **Build/deploy**: Vite dev proxy for CORS-free local dev; multi-stage Dockerfile →
  nginx with a runtime-rendered `config.js`; nginx CSP + security headers; a
  Traefik/`lab_net` compose stack; and `deploy/ROLLOUT.md` with backup and a staged
  rollback plan.

[Unreleased]: https://git.discworld.casa/laurence/openbao-gui/compare/v0.2.0...HEAD
[0.2.0]: https://git.discworld.casa/laurence/openbao-gui/compare/v0.1.0...v0.2.0
[0.1.0]: https://git.discworld.casa/laurence/openbao-gui/releases/tag/v0.1.0
