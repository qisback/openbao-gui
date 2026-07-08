# Architecture

## Overview

openbao-gui is a client-only single-page application (SPA). There is no backend of
its own: the browser loads static assets from nginx and then makes API calls
straight to OpenBao. All logic — auth, routing, data fetching, rendering — runs in
the browser.

```
                          ┌───────────────────────────────┐
   Browser                │            nginx               │
 ┌──────────┐  GET /,     │  serves the built SPA          │
 │  SPA     │──assets────▶│  (index.html, /assets/*, /config.js)
 │ (React)  │             └───────────────────────────────┘
 │          │
 │          │   XHR/fetch to the OpenBao HTTP API (cross-origin)
 │          │──────────────────────────────────────────────▶ OpenBao  /v1/*
 │          │   X-Vault-Token header
 │          │
 │          │   OIDC login: top-level redirect
 │          │──────────────────────────────────────────────▶ authentik (IdP)
 └──────────┘
```

Two important consequences of being client-only:

1. **The GUI holds no secrets and no server-side session.** The only credential is
   the OpenBao token, which lives in the browser tab (`sessionStorage`) and is sent
   as the `X-Vault-Token` header on each request. See [Authentication](authentication.md).
2. **The SPA origin and the API origin are usually different** (e.g. the GUI on
   `bao.example` and the API on `openbao.example`). That makes API calls
   cross-origin, so **OpenBao must have CORS enabled** for the GUI origin. See
   [Deployment](deployment.md#cors).

## Technology

| Concern | Choice | Notes |
|---------|--------|-------|
| Framework | React 18 | Function components + hooks only. |
| Language | TypeScript (strict) | `noUnusedLocals`/`noUnusedParameters` on. |
| Build | Vite 5 | Fast dev server with an API proxy; production build to `dist/`. |
| Routing | react-router-dom 6 | Client-side routing with an auth guard. |
| Server state | @tanstack/react-query 5 | Caching, refetch, mutations. |
| Styling | Hand-written CSS design system | One accent colour; dark theme. No CSS framework. |
| Icons | Inline SVG / emoji | No icon dependency. |

The dependency surface is deliberately small (four runtime deps) to keep the bundle
lean (~75 KB gzipped) and the supply chain narrow.

## Source layout

```
src/
  main.tsx            App bootstrap: QueryClient, Router, Toasts, AuthProvider.
  App.tsx             Route table + the RequireAuth guard.
  index.css           The entire design system (CSS variables + component classes).

  lib/
    config.ts         Reads window.OPENBAO_GUI_CONFIG into a typed `config`.
    types.ts          TypeScript shapes for OpenBao API responses.
    api.ts            The typed HTTP client (see docs/api-client.md).
    auth.tsx          AuthProvider/useAuth: token state + the three login flows.

  components/
    Layout.tsx        Authenticated shell: sidebar nav + top status bar + <Outlet/>.
    ui.tsx            UI kit: Button, Card, Input, Field, Badge, Spinner, Modal,
                      ErrorBox, and the Toast provider/hook.

  pages/
    Login.tsx         Token / Userpass / SSO tabs.
    OidcCallback.tsx  OIDC redirect landing; exchanges code for a token.
    Dashboard.tsx     Seal/HA/version/mounts + your token. 403-tolerant.
    Secrets.tsx       KV engine browser + full v2/v1 CRUD (one component, 3 views).
    AuthMethods.tsx   List of enabled auth backends.
    Policies.tsx      ACL policy list.
    PolicyEdit.tsx    View / create / edit / delete a single ACL policy.
    Access.tsx        Identity entities + groups (read).
    Seal.tsx          Seal status + unseal (Shamir shares) + guarded seal.
    NotFound.tsx      404.
```

## Request flow

1. `index.html` loads `/config.js` (a plain script, not a module) **before** the
   bundle, so `window.OPENBAO_GUI_CONFIG` is available immediately.
2. `main.tsx` mounts the provider stack: `QueryClientProvider` → `BrowserRouter` →
   `ToastProvider` → `AuthProvider` → `App`.
3. `AuthProvider` revives any token from `sessionStorage` and validates it with
   `auth/token/lookup-self`. Until that resolves, routes render a spinner.
4. `App` routes: `/login` and `/oidc/callback` are public; everything else is
   wrapped in `RequireAuth`, which redirects to `/login` if there is no token.
5. Authenticated pages use React Query hooks that call `api.*`, which attaches the
   token and talks to `${apiBase}/v1/...`.

## Security model

Following the hardening themes in RFC #1364:

- **Token scope in the browser:** token in `sessionStorage` only (cleared when the
  tab closes), never `localStorage`, never a cookie. Sent as `X-Vault-Token`.
- **Content Security Policy:** nginx sets a restrictive CSP — `default-src 'self'`,
  `connect-src` limited to self + the OpenBao API origin, `frame-ancestors 'none'`,
  `form-action` limited to self + the authentik origin. See [nginx.conf](../nginx.conf).
- **No framing / no sniffing:** `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`.
- **TLS everywhere:** Traefik terminates TLS with the estate step-ca; the API is
  reached over HTTPS. The GUI itself carries no secret material at rest.
- **Permission-aware UI:** dashboard/identity queries tolerate `403`/`404` and
  render what the token *can* see rather than an error wall — the RFC calls out the
  Ember UI's "see but cannot access" confusion as a problem to avoid.

## Relationship to OpenBao

openbao-gui is an independent project: a fresh repository, no shared code, not a
fork. It depends only on OpenBao's stable HTTP API, which is compatible with the
HashiCorp Vault API for the endpoints used here. The built-in `/ui` remains fully
functional and is the fallback if the GUI is ever removed.
