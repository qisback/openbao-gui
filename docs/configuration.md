# Configuration

openbao-gui is configured at **runtime**, not baked into the build. One built image
can be pointed at any OpenBao by changing environment variables — no rebuild.

## How it works

- The app reads `window.OPENBAO_GUI_CONFIG`, which is set by `/config.js`.
- `/config.js` is a plain script loaded in `index.html` **before** the bundle, so
  the config is present the moment the app starts.
- In the container, [`docker-entrypoint.sh`](../docker-entrypoint.sh) regenerates
  `/config.js` from environment variables each time the container starts (it runs
  via nginx's `/docker-entrypoint.d`).
- In local dev, the checked-in [`public/config.js`](../public/config.js) provides
  the defaults.

The typed view of the config lives in [`src/lib/config.ts`](../src/lib/config.ts).

## Settings

| Config key | Env var (container) | Default | Meaning |
|------------|--------------------|---------|---------|
| `apiBase` | `BAO_ADDR` | `''` | Base URL of the OpenBao API. `''` means **same origin** (used with the dev proxy). In production set it to the OpenBao public address, e.g. `https://openbao.example`. No trailing slash needed — it is stripped. |
| `oidcMount` | `OIDC_MOUNT` | `oidc` | The OpenBao OIDC auth mount path (`bao auth enable oidc` → `oidc`). |
| `oidcRole` | `OIDC_ROLE` | `operator` | The OIDC role used for SSO login. |

### `apiBase` and origins

- **Same-origin (`apiBase=''`)** is only practical in local dev, where Vite proxies
  `/v1` to a real OpenBao (see below). In this mode there is no CORS.
- **Cross-origin (`apiBase='https://openbao.example'`)** is the normal production
  setup: the GUI is on its own hostname and calls the API on another. This requires
  **CORS enabled on OpenBao** and the API origin allowed in the nginx CSP
  `connect-src`. See [Deployment → CORS](deployment.md#cors).

## Example: production `config.js`

Rendered by the entrypoint from `BAO_ADDR=https://openbao.example OIDC_ROLE=operator`:

```js
window.OPENBAO_GUI_CONFIG = {
  apiBase: 'https://openbao.example',
  oidcMount: 'oidc',
  oidcRole: 'operator',
};
```

## Example: local dev `.env`

Copy [`.env.example`](../.env.example) to `.env`:

```bash
BAO_ADDR=https://openbao.example   # Vite proxies /v1 here (CORS-free)
OIDC_MOUNT=oidc
OIDC_ROLE=operator
```

`BAO_ADDR` is read by [`vite.config.ts`](../vite.config.ts) to set the dev proxy
target; it does **not** set `apiBase` for the browser (dev uses same-origin `''`
plus the proxy).

## CSP note

The nginx `connect-src` directive hard-codes the OpenBao API origin. If you deploy
against a different OpenBao hostname, update `connect-src` in
[`nginx.conf`](../nginx.conf) to match, or the browser will block the API calls.
