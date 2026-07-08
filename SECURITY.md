# Security

openbao-gui is a client-only SPA for a secrets manager, so its security surface is
the browser: token handling, XSS, CSP, the OIDC flow, clipboard, and the nginx/
container config. This document records the threat model and the results of the
deep security audit, with the remediation status of each finding.

## Security model (design)

- **Token scope in the browser.** The OpenBao token lives in `sessionStorage`
  only (per-tab, cleared when the tab closes) and is sent as `X-Vault-Token`.
  Never in `localStorage`, a cookie, or a URL.
- **No injected-content execution.** No `dangerouslySetInnerHTML`, `innerHTML`,
  `eval`, or `document.write` anywhere. All API data is rendered through React's
  default escaping. A strict CSP (`script-src 'self'`, `style-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`) backs this up.
- **Server enforces authorization.** The UI is permission-aware (it hides actions
  the token lacks via `sys/capabilities-self`), but this is UX only — OpenBao's
  ACLs are the actual boundary.
- **Additive deployment.** The GUI is a client of the API; it stores no data and
  makes no server changes. The built-in `/ui` remains as a fallback.

## Session security

- Token auto-validated on load (`lookup-self`); invalid tokens are discarded.
- **Idle auto-logout** after 30 min of inactivity.
- **Absolute session cap** of 8 h regardless of activity.
- **Renewable-token auto-renew** before TTL lapses.
- **Server-side revoke** (`auth/token/revoke-self`) on explicit and idle logout,
  so a signed-out token doesn't stay valid until its TTL.

## Audit — 2026-07-08

Deep, adversarial review of all of `src/`, `nginx.conf`, `Dockerfile`,
`docker-entrypoint.sh`, `docker-compose.yml`, `vite.config.ts`, `index.html`,
`public/config.js`, and `docs/`, plus `npm audit`. No Critical issues. Findings
and status:

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| H1 | High | OIDC callback didn't validate `state` (login-CSRF / session-fixation) | **Fixed** — `beginOidc` records the expected `state` from the auth URL; `completeOidc` refuses the exchange on mismatch |
| H2 | High | Unguarded `JSON.parse` of OIDC transient; nonce in sessionStorage | **Fixed** — parse guarded; transient cleared on every error path |
| H3 | High | CSP allowed `style-src 'unsafe-inline'`; no `object-src` | **Fixed** — `unsafe-inline` removed (React inline styles use the CSSOM, unaffected); added `object-src 'none'`, `frame-src 'none'`, `form-action 'self'` |
| H4 | High | No HSTS / `Permissions-Policy`; SPA fallback not `no-store` | **Fixed** — HSTS + Permissions-Policy added; documents revalidated via `expires -1`; headers inherited by all locations |
| M1 | Medium | Secrets copied to clipboard with no auto-clear | **Fixed** — `copySensitive()` wipes the clipboard after 45 s (if it still holds the value) |
| M2 | Medium | Logout was client-side only (token stayed valid) | **Fixed** — `revoke-self` on logout/idle-logout |
| M3 | Medium | No absolute session cap | **Fixed** — 8 h ceiling enforced |
| M4 | Medium | Auto-renew extends a leaked token's validity | **Mitigated** — bounded by M2 + M3 |
| M5 | Medium | Dev proxy defaulted to production, `secure:false`, all interfaces | **Fixed** — no default target (must set `BAO_ADDR`); binds `127.0.0.1` |
| M6 | Medium | CSP `connect-src` host hardcoded, could mismatch `BAO_ADDR` | **Fixed** — entrypoint templates `connect-src` from `BAO_ADDR` |
| M7 | Medium | Entrypoint interpolated env into JS with no escaping | **Fixed** — inputs validated (URL/identifier patterns), rejected if unsafe |
| L1 | Low | ErrorBoundary logged to console in production | **Fixed** — gated behind `import.meta.env.DEV` |
| L2 | Low | Revealed secrets / raw API objects in the DOM | **Accepted** — inherent to a secrets UI; reveal defaults off |
| L3 | Low | No `autocomplete=off` on token/unseal/password inputs | **Fixed** |
| L4 | Low | Capability gating could be mistaken for a security control | **Accepted** — documented; server enforces |
| L5 | Low | User path segments not URL-encoded in API calls | **Fixed** — `encodeURIComponent` per segment in the client |
| L6 | Info | Native `confirm()` for destructive actions | **Accepted** — seal uses typed confirmation |

### Supply chain

`npm audit --production` (shipped bundle): **0 vulnerabilities.** The runtime deps
(react, react-dom, react-router-dom, @tanstack/react-query) are clean.

Dev-only: `esbuild` was updated to a patched `^0.25` (via an `overrides` pin). One
residual **dev-server-only** `vite` advisory (path traversal / `fs.deny` bypass /
editor-launch in the dev server) remains; it does not affect the production static
build and its network vector is closed by binding the dev server to `127.0.0.1`.
Fixing it fully requires the `vite@8` breaking upgrade — tracked as a follow-up.

## Reporting

This is a homelab project. Report issues via the repository tracker.
