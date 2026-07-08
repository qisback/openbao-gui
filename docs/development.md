# Development

## Prerequisites

- Node.js 20+ (built with Node 24) and npm.
- Network access to a running OpenBao (for the dev proxy). You do not need to run
  OpenBao locally, but you need to be able to reach one.

## Setup

```bash
npm install
```

## Run the dev server

```bash
BAO_ADDR=https://openbao.example npm run dev
```

Open http://localhost:5173.

`vite.config.ts` proxies `/v1` → `BAO_ADDR`, so in dev the app runs same-origin and
there is **no CORS** to configure. `secure: false` is set so an internal step-ca
certificate is accepted — dev only.

## Scripts

| Script | Does |
|--------|------|
| `npm run dev` | Vite dev server with HMR and the `/v1` proxy. |
| `npm run build` | Type-check (`tsc --noEmit`) then Vite production build to `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |
| `npm run lint` | Type-check only. |

The build fails on type errors and on unused locals/parameters (strict tsconfig),
so a green `npm run build` is the bar before committing.

## Project layout

See [Architecture → Source layout](architecture.md#source-layout) for the full
tree. In short: `lib/` is non-visual (config, types, API, auth), `components/` is
the shell + UI kit, `pages/` are the routed screens.

## How to add a page

1. Create `src/pages/MyPage.tsx`.
2. Add a `<Route>` for it in [`App.tsx`](../src/App.tsx) (inside the `RequireAuth`
   layout group unless it's public).
3. Add a nav entry to the `NAV` array in [`Layout.tsx`](../src/components/Layout.tsx).
4. Fetch data with React Query calling `api.*`; render with the UI kit from
   [`components/ui.tsx`](../src/components/ui.tsx).

## How to add an API call

See [API client → Adding a new call](api-client.md#adding-a-new-call).

## Conventions

- **Styling** goes in `index.css` as reusable classes; components reference classes
  rather than embedding large inline style objects. There is one accent colour and a
  small set of component classes — reuse them.
- **Server state** lives in React Query, not `useState`. Key queries so related
  views invalidate together (e.g. writing a secret invalidates its read + metadata).
- **Errors**: throw `ApiError` from the client; show it with `<ErrorBox>` for
  blocking errors or a toast for action feedback. Swallow `403`/`404` only for
  read-only panels that should degrade gracefully.
- **Comments**: explain *why*, at the top of each non-trivial file/function, so the
  next reader understands intent without the git history.

## Testing against a real instance

There is no mock server. Point the dev proxy at a non-production OpenBao (or a dev
`bao server -dev`) and log in with a token. For OIDC you need a reachable IdP and a
registered `http://localhost:5173/oidc/callback` redirect URI, so token/userpass are
easier for local iteration.
