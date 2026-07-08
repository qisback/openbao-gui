# API client

The GUI talks to OpenBao through one small typed client:
[`src/lib/api.ts`](../src/lib/api.ts). Response shapes are in
[`src/lib/types.ts`](../src/lib/types.ts).

## Design

- **One `request()` function** builds the URL (`${apiBase}/v1/<path>`), attaches the
  token (`X-Vault-Token`), serialises the JSON body, and normalises errors.
- **`requestData()`** wraps `request()` and unwraps OpenBao's `{ data: … }`
  envelope for the common case.
- **`api`** is a flat object of named methods, one per endpoint the GUI uses, so
  pages never build URLs by hand.

### Token injection

The current token is held in a module variable, set via `setToken()` (called by
`AuthProvider`). Every request includes it unless `auth: false` is passed (used by
pre-auth calls like seal-status, unseal, and the login endpoints). A per-call
`token` override is used during login validation.

### LIST convention

Browsers cannot send the HTTP `LIST` verb OpenBao uses, so list calls use the
documented `?list=true` query-parameter form instead (a `GET`).

### Errors

Non-2xx responses raise an `ApiError` carrying the HTTP `status` and OpenBao's
`errors[]` array. `204 No Content` returns `undefined`. React Query surfaces the
thrown `ApiError`; pages either show it via `<ErrorBox>` / a toast, or — for
read-only panels — swallow `403`/`404` to stay permission-aware.

## Endpoints used

### System
| Method | Endpoint | Auth |
|--------|----------|------|
| `sealStatus` | `GET sys/seal-status` | no |
| `health` | `GET sys/health` | no |
| `leader` | `GET sys/leader` | no |
| `lookupSelf` | `GET auth/token/lookup-self` | yes |
| `seal` | `PUT sys/seal` | yes |
| `unseal` | `PUT sys/unseal` | no |
| `mounts` | `GET sys/mounts` | yes |
| `authMounts` | `GET sys/auth` | yes |

### KV v2
| Method | Endpoint |
|--------|----------|
| `kvv2List` | `GET {mount}/metadata/{path}?list=true` |
| `kvv2Read` | `GET {mount}/data/{path}?version=` |
| `kvv2Metadata` | `GET {mount}/metadata/{path}` |
| `kvv2Write` | `POST {mount}/data/{path}` |
| `kvv2DeleteLatest` | `DELETE {mount}/data/{path}` |
| `kvv2Undelete` | `POST {mount}/undelete/{path}` |
| `kvv2Destroy` | `POST {mount}/destroy/{path}` |
| `kvv2DeleteMetadata` | `DELETE {mount}/metadata/{path}` |

### KV v1
`kvv1List` / `kvv1Read` / `kvv1Write` / `kvv1Delete` at `{mount}/{path}`.

### Policies
`policies` (list) / `policy` (read) / `writePolicy` / `deletePolicy` at
`sys/policies/acl[/name]`.

### Identity
`entities` / `entity` at `identity/entity/id[/…]`; `groups` / `group` at
`identity/group/id[/…]`.

### Auth
| Method | Endpoint |
|--------|----------|
| `userpassLogin` | `POST auth/{mount}/login/{username}` |
| `oidcAuthUrl` | `POST auth/{mount}/oidc/auth_url` |
| `oidcCallback` | `GET auth/{mount}/oidc/callback?state=&code=&client_nonce=` |

## Adding a new call

1. Add the response type to `types.ts` if needed.
2. Add a method to the `api` object in `api.ts` using `request`/`requestData`.
3. Call it from a page with `useQuery` (reads) or `useMutation` (writes), keyed
   sensibly so related views invalidate together.

See [Development](development.md) for the fuller walkthrough.
