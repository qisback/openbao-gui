# Authentication

All auth is implemented in [`src/lib/auth.tsx`](../src/lib/auth.tsx) (`AuthProvider`
+ `useAuth`). The GUI supports three login methods. Whichever is used, the result is
the same: an OpenBao **client token**, validated with `auth/token/lookup-self`,
stored in `sessionStorage`, and sent as the `X-Vault-Token` header on every request.

## Token handling

- The token is stored under `sessionStorage["openbao-gui.token"]`. `sessionStorage`
  is per-tab and cleared when the tab closes — the token never persists to disk and
  is never placed in `localStorage` or a cookie.
- On load, `AuthProvider` revives a stored token and validates it with
  `lookup-self`. If validation fails (expired/revoked), the token is discarded and
  the user is sent to `/login`.
- The current token is mirrored into the API client via `setToken()`, so
  `api.*` calls automatically include `X-Vault-Token`.
- **Sign out** removes the token from `sessionStorage` and clears it from the
  client. It does not revoke the token server-side (a client-side sign-out).
- **Idle auto-logout**: after 30 minutes with no pointer/keyboard/scroll activity
  the session is cleared, so a secrets UI does not sit unlocked unattended.
- **Auto-renew**: a *renewable* token is renewed (`auth/token/renew-self`) before
  its TTL lapses, so an active session doesn't drop mid-task. Non-renewable tokens
  are left as-is.

## 1. Token

The simplest flow: the user pastes an existing OpenBao token. The GUI validates it
by calling `auth/token/lookup-self` with that token before accepting it. Works on
any OpenBao and with any policy-bound token, including root.

## 2. Userpass

`POST auth/{mount}/login/{username}` with `{ password }`. The mount defaults to
`userpass` but is editable on the login form. The returned `auth.client_token`
becomes the session token.

## 3. OIDC / SSO (the primary path)

Standard OpenBao OIDC login against an external identity provider (in the reference
estate, authentik). Two phases, spanning a browser redirect:

### Phase 1 — begin (`beginOidc`)

1. Generate a random `client_nonce` (`crypto.randomUUID()`), and store it together
   with the chosen `mount`/`role` in `sessionStorage["openbao-gui.oidc_nonce"]`.
2. `POST auth/{mount}/oidc/auth_url` with:
   ```json
   {
     "role": "operator",
     "redirect_uri": "https://<gui-origin>/oidc/callback",
     "client_nonce": "<nonce>"
   }
   ```
3. OpenBao returns `data.auth_url` (an authentik URL carrying `state` + the
   `redirect_uri`). The browser navigates there (top-level `window.location.assign`).

### Phase 2 — callback (`completeOidc`, on `/oidc/callback`)

1. The IdP authenticates the user and redirects back to
   `https://<gui-origin>/oidc/callback?state=…&code=…`.
2. [`OidcCallback.tsx`](../src/pages/OidcCallback.tsx) reads `state` and `code`,
   retrieves the stored `client_nonce`, and calls
   `GET auth/{mount}/oidc/callback?state=…&code=…&client_nonce=…`.
3. OpenBao returns `auth.client_token`; the app stores it and navigates to `/`.

> The `useEffect` in the callback page guards against React StrictMode's
> double-invoke so the authorization code is only exchanged once.

### Prerequisites for OIDC to work

The `redirect_uri` the GUI sends (`https://<gui-origin>/oidc/callback`) must be
registered in **two** places, or login fails:

1. The **OpenBao OIDC role**'s `allowed_redirect_uris`
   (`bao write auth/oidc/role/<role> allowed_redirect_uris=…`).
2. The **IdP application**'s allowed redirect URIs (e.g. the authentik OAuth2
   provider).

Both are documented, with exact commands, in the [rollout runbook](../deploy/ROLLOUT.md).

## Authorization (what a user can do)

The GUI does not implement its own authorization — every action is governed by the
policies attached to the logged-in token. The UI is **permission-aware**: read
queries tolerate `403`/`404` and simply render less, rather than erroring, so a
low-privilege token still gets a usable dashboard. A write the token isn't allowed
to make will surface OpenBao's permission-denied error as a toast.
