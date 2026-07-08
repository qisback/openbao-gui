# Features

Page-by-page reference. Navigation is the left sidebar; the top bar shows live seal
status, storage type, and the current identity with a sign-out button.

## Dashboard (`/`)

Read-only cluster overview. Cards: seal status (with Shamir `t of n` and unseal
progress), high-availability/raft state, version, storage type, secrets-engine
count, auth-method count, and initialization state. Below that, your token's
display name, policies, entity ID, TTL and renewability.

Every panel is **403-tolerant** — a card whose backing endpoint the token can't read
shows `—` rather than failing the page.

Source: [`pages/Dashboard.tsx`](../src/pages/Dashboard.tsx).

## Secrets (`/secrets`)

KV secrets browser with full CRUD, covering both **KV v2** (versioned) and **KV v1**.
One component renders three views off the URL `/secrets/:mount/<path...>`:

- **Engine list** (`/secrets`) — lists the KV secrets engines from `sys/mounts`. If
  the token can't read `sys/mounts`, you can still open a known engine directly,
  e.g. `/secrets/kv/`.
- **Key list** (path ends in `/`) — lists keys at a path; folders (trailing `/`) are
  navigable, leaves open the secret.
- **Secret view** (leaf path) — shows the key/value pairs, values masked with a
  reveal toggle.

Operations:

| Action | KV v2 | KV v1 |
|--------|-------|-------|
| Read | `GET {mount}/data/{path}` (any version) | `GET {mount}/{path}` |
| Version history | ✅ from `{mount}/metadata/{path}` — pick any version | n/a |
| Create / update | `POST {mount}/data/{path}` | `POST {mount}/{path}` |
| Delete (latest) | `DELETE {mount}/data/{path}` (soft delete) | `DELETE {mount}/{path}` |

The KV version is detected from the mount's `options.version`; if `sys/mounts` is
unreadable it assumes v2 (falling back to v1 on error). The editor is a key/value
row editor (add/remove fields). Deleted/destroyed versions are badged.

Source: [`pages/Secrets.tsx`](../src/pages/Secrets.tsx).

Enabling a KV engine (v1/v2) and disabling engines are available from the toolbar
and per-row actions. Power features on the secret view: a JSON/table toggle,
per-field copy-to-clipboard, a key filter on large folders, and a JSON editing
mode alongside the key/value form. Edit/Delete are hidden when the token lacks the
capability on the path (`sys/capabilities-self`).

Source: [`pages/Secrets.tsx`](../src/pages/Secrets.tsx).

## Auth methods (`/auth`)

Lists enabled auth backends from `sys/auth` (path, type, description), and manages
them: enable a new method (type + mount path) or disable an existing one. Mirrors
`bao auth enable/disable/list`.

Source: [`pages/AuthMethods.tsx`](../src/pages/AuthMethods.tsx).

## AppRole (`/approle`)

Manages the AppRole auth method — the estate's machine-identity backbone. Lists
roles on the approle mount; per role you can read the `role_id`, generate a fresh
`secret_id` (shown once, copyable), view and destroy secret-id accessors, see the
role's token policy/TTL config, and create or delete roles.

Source: [`pages/AppRole.tsx`](../src/pages/AppRole.tsx).

## Tokens (`/tokens`)

Lists active tokens by accessor (`auth/token/accessors`) with per-accessor lookup,
creates a token (policies/TTL/display-name/renewable — the value is shown once and
copyable), and revokes by accessor.

Source: [`pages/Tokens.tsx`](../src/pages/Tokens.tsx).

## Leases (`/leases`)

Walks the lease tree from a prefix (`sys/leases/lookup`), looks up a lease's
detail, and revokes a single lease or an entire prefix (guarded).

Source: [`pages/Leases.tsx`](../src/pages/Leases.tsx).

## Raft storage (`/raft`)

For raft (integrated storage): shows the peer set (leader/voter/health), autopilot
state and failure tolerance, **downloads a point-in-time snapshot** straight to the
browser (the primary backup artifact), and removes a dead peer (guarded).

Source: [`pages/Raft.tsx`](../src/pages/Raft.tsx).

## Audit devices (`/audit`)

Lists audit devices (`sys/audit`), enables a file or syslog device, and disables
one. A secrets store should have at least one audit device.

Source: [`pages/Audit.tsx`](../src/pages/Audit.tsx).

## Policies (`/policies`, `/policies/:name`)

ACL policies (HCL):

- **List** all policies (`sys/policies/acl`).
- **View** a policy's HCL.
- **Create** a new policy (`/policies/new`).
- **Edit** and save (`PUT sys/policies/acl/{name}`).
- **Delete** (not offered for the built-in `root`/`default`).
- `root` is read-only (OpenBao rejects writes to it).

Source: [`pages/Policies.tsx`](../src/pages/Policies.tsx),
[`pages/PolicyEdit.tsx`](../src/pages/PolicyEdit.tsx).

## Access (`/access`)

Identity management with an Entities/Groups toggle. Create and edit entities (name,
policies) and groups (name, internal/external type, policies, member entity IDs),
and delete either. External groups are how the estate binds auth-backend groups
(e.g. AD groups) to OpenBao policies.

Source: [`pages/Access.tsx`](../src/pages/Access.tsx).

## Seal / Unseal (`/seal`)

- **Status** — seal type, sealed flag, threshold, current unseal progress (polled).
- **Unseal** — submit one Shamir key share at a time (`PUT sys/unseal`); the button
  shows `progress / threshold`. Unauthenticated, as OpenBao requires.
- **Seal** — `PUT sys/seal` (needs a privileged token), guarded behind a typed
  `SEAL` confirmation because it takes the instance offline.

Source: [`pages/Seal.tsx`](../src/pages/Seal.tsx).

## Not yet covered (roadmap)

Tracked for later: specialised engine UIs (transit, PKI, database dynamic
credentials); mount *tuning* UI (enable/disable are done, fine-grained tune is
not); and the sandboxed plugin system proposed in RFC #1364. The theme offers
light/dark but is a custom design system rather than Material Design.
