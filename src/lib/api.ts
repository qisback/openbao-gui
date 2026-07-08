// Thin typed client over the OpenBao HTTP API.
//
// Every logical-storage call goes through request(); it attaches the current
// token (X-Vault-Token), serialises the body, and normalises OpenBao's error
// envelope ({errors: [...]}) into a thrown ApiError so React Query can surface
// it. LIST requests use the ?list=true convention rather than the HTTP LIST
// verb, which browsers cannot send.

import { apiBase } from './config'

export class ApiError extends Error {
  status: number
  errors: string[]
  constructor(status: number, errors: string[]) {
    super(errors[0] || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

let currentToken: string | null = null
export function setToken(token: string | null) {
  currentToken = token
}
export function getToken() {
  return currentToken
}

// Encode a single user-supplied path segment so a value containing `/ ? # %`
// can't alter the request path or split off a query string (audit L5).
const seg = (s: string) => encodeURIComponent(s)
// Encode a slash-separated path (e.g. a KV path) segment-by-segment, preserving
// the intentional `/` separators.
const segPath = (p: string) =>
  p
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')

interface RequestOpts {
  method?: string
  body?: unknown
  // Send X-Vault-Token even for this call (default true). Set false for the
  // pre-auth calls (seal-status, login) that must not fail on a stale token.
  auth?: boolean
  // Explicit token override (used during login validation).
  token?: string
  // Query parameters.
  params?: Record<string, string | number | boolean | undefined>
}

async function request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = true, token, params } = opts
  const url = new URL(`${apiBase}/v1/${path.replace(/^\//, '')}`, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const headers: Record<string, string> = {}
  const tok = token ?? (auth ? currentToken : null)
  if (tok) headers['X-Vault-Token'] = tok
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }

  if (!res.ok) {
    const errs =
      json && typeof json === 'object' && 'errors' in json
        ? ((json as { errors: string[] }).errors ?? [])
        : []
    throw new ApiError(res.status, errs.length ? errs : [text || `HTTP ${res.status}`])
  }
  return json as T
}

// Unwrap the OpenBao `{data: ...}` envelope.
async function requestData<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const r = await request<{ data: T }>(path, opts)
  return (r as { data: T })?.data
}

// Fetch a raw binary body (used by the raft snapshot download, which streams a
// gzipped snapshot rather than JSON). Returns a Blob; errors still surface as
// ApiError via a best-effort JSON parse of the error body.
async function requestBlob(path: string): Promise<Blob> {
  const url = `${apiBase}/v1/${path.replace(/^\//, '')}`
  const headers: Record<string, string> = {}
  if (currentToken) headers['X-Vault-Token'] = currentToken
  const res = await fetch(url, { headers })
  if (!res.ok) {
    let errs: string[] = []
    try {
      const j = await res.json()
      errs = j?.errors ?? []
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, errs.length ? errs : [`HTTP ${res.status}`])
  }
  return res.blob()
}

export const api = {
  request,
  requestData,

  // --- system ---
  sealStatus: () => request('sys/seal-status', { auth: false }),
  health: () =>
    request('sys/health', { auth: false, params: { standbyok: true, sealedcode: 200, uninitcode: 200 } }),
  leader: () => request('sys/leader', { auth: false }),
  lookupSelf: (token?: string) => requestData('auth/token/lookup-self', { token }),

  seal: () => request('sys/seal', { method: 'PUT' }),
  unseal: (key: string) => request('sys/unseal', { method: 'PUT', body: { key }, auth: false }),

  // Capabilities of the current token on one or more paths. Returns a map of
  // path -> capability list (e.g. ["read","update"]). Used to gate write UI.
  capabilitiesSelf: (paths: string[]) =>
    request<{ capabilities?: string[] } & Record<string, string[]>>('sys/capabilities-self', {
      method: 'POST',
      body: { paths },
    }),

  // --- raft ---
  raftConfig: () =>
    requestData<{ config: { servers: import('./types').RaftServer[] } }>('sys/storage/raft/configuration'),
  raftAutopilotState: () => requestData('sys/storage/raft/autopilot/state'),
  raftSnapshot: () => requestBlob('sys/storage/raft/snapshot'),
  raftRemovePeer: (serverId: string) =>
    request('sys/storage/raft/remove-peer', { method: 'POST', body: { server_id: serverId } }),

  // --- mounts ---
  mounts: () => requestData('sys/mounts'),
  authMounts: () => requestData('sys/auth'),

  // --- secrets-engine management ---
  enableMount: (path: string, body: Record<string, unknown>) =>
    request(`sys/mounts/${segPath(path)}`, { method: 'POST', body }),
  disableMount: (path: string) => request(`sys/mounts/${segPath(path)}`, { method: 'DELETE' }),
  readMountTune: (path: string) => requestData(`sys/mounts/${segPath(path)}/tune`),
  tuneMount: (path: string, body: Record<string, unknown>) =>
    request(`sys/mounts/${segPath(path)}/tune`, { method: 'POST', body }),

  // --- auth-method management ---
  enableAuth: (path: string, body: Record<string, unknown>) =>
    request(`sys/auth/${segPath(path)}`, { method: 'POST', body }),
  disableAuth: (path: string) => request(`sys/auth/${segPath(path)}`, { method: 'DELETE' }),

  // --- audit devices ---
  auditDevices: () => requestData<Record<string, import('./types').AuditDevice>>('sys/audit'),
  enableAudit: (path: string, body: Record<string, unknown>) =>
    request(`sys/audit/${segPath(path)}`, { method: 'POST', body }),
  disableAudit: (path: string) => request(`sys/audit/${segPath(path)}`, { method: 'DELETE' }),

  // --- kv v2 --- (mount + path segments are URL-encoded; audit L5)
  kvv2List: (mount: string, path: string) =>
    requestData<{ keys: string[] }>(`${seg(mount)}/metadata/${segPath(path)}`, { params: { list: true } }),
  kvv2Read: (mount: string, path: string, version?: number) =>
    requestData(`${seg(mount)}/data/${segPath(path)}`, { params: { version } }),
  kvv2Metadata: (mount: string, path: string) => requestData(`${seg(mount)}/metadata/${segPath(path)}`),
  kvv2Write: (mount: string, path: string, data: Record<string, unknown>, cas?: number) =>
    request(`${seg(mount)}/data/${segPath(path)}`, {
      method: 'POST',
      body: { data, options: cas !== undefined ? { cas } : {} },
    }),
  kvv2DeleteLatest: (mount: string, path: string) =>
    request(`${seg(mount)}/data/${segPath(path)}`, { method: 'DELETE' }),
  kvv2Undelete: (mount: string, path: string, versions: number[]) =>
    request(`${seg(mount)}/undelete/${segPath(path)}`, { method: 'POST', body: { versions } }),
  kvv2Destroy: (mount: string, path: string, versions: number[]) =>
    request(`${seg(mount)}/destroy/${segPath(path)}`, { method: 'POST', body: { versions } }),
  kvv2DeleteMetadata: (mount: string, path: string) =>
    request(`${seg(mount)}/metadata/${segPath(path)}`, { method: 'DELETE' }),

  // --- kv v1 ---
  kvv1List: (mount: string, path: string) =>
    requestData<{ keys: string[] }>(`${seg(mount)}/${segPath(path)}`, { params: { list: true } }),
  kvv1Read: (mount: string, path: string) => requestData(`${seg(mount)}/${segPath(path)}`),
  kvv1Write: (mount: string, path: string, data: Record<string, unknown>) =>
    request(`${seg(mount)}/${segPath(path)}`, { method: 'POST', body: data }),
  kvv1Delete: (mount: string, path: string) =>
    request(`${seg(mount)}/${segPath(path)}`, { method: 'DELETE' }),

  // --- policies ---
  policies: () => requestData<{ keys: string[] }>('sys/policies/acl', { params: { list: true } }),
  policy: (name: string) => requestData<{ name: string; policy: string }>(`sys/policies/acl/${seg(name)}`),
  writePolicy: (name: string, policy: string) =>
    request(`sys/policies/acl/${seg(name)}`, { method: 'POST', body: { policy } }),
  deletePolicy: (name: string) => request(`sys/policies/acl/${seg(name)}`, { method: 'DELETE' }),

  // --- identity ---
  entities: () => requestData<{ key_info: Record<string, { name: string }> }>('identity/entity/id', { params: { list: true } }),
  entity: (id: string) => requestData(`identity/entity/id/${seg(id)}`),
  writeEntity: (body: Record<string, unknown>) =>
    request<{ data?: { id: string } }>('identity/entity', { method: 'POST', body }),
  updateEntity: (id: string, body: Record<string, unknown>) =>
    request(`identity/entity/id/${seg(id)}`, { method: 'POST', body }),
  deleteEntity: (id: string) => request(`identity/entity/id/${seg(id)}`, { method: 'DELETE' }),
  groups: () => requestData<{ key_info: Record<string, { name: string }> }>('identity/group/id', { params: { list: true } }),
  group: (id: string) => requestData(`identity/group/id/${seg(id)}`),
  writeGroup: (body: Record<string, unknown>) =>
    request<{ data?: { id: string } }>('identity/group', { method: 'POST', body }),
  updateGroup: (id: string, body: Record<string, unknown>) =>
    request(`identity/group/id/${seg(id)}`, { method: 'POST', body }),
  deleteGroup: (id: string) => request(`identity/group/id/${seg(id)}`, { method: 'DELETE' }),

  // --- tokens ---
  tokenAccessors: () =>
    requestData<{ keys: string[] }>('auth/token/accessors', { params: { list: true } }),
  tokenLookupAccessor: (accessor: string) =>
    requestData('auth/token/lookup-accessor', { method: 'POST', body: { accessor } }),
  createToken: (body: Record<string, unknown>) =>
    request<{ auth: import('./types').AuthResponse }>('auth/token/create', { method: 'POST', body }),
  revokeAccessor: (accessor: string) =>
    request('auth/token/revoke-accessor', { method: 'POST', body: { accessor } }),
  renewSelf: (increment?: string) =>
    request<{ auth: import('./types').AuthResponse }>('auth/token/renew-self', {
      method: 'POST',
      body: increment ? { increment } : {},
    }),
  // Revoke the current token server-side (used on explicit/idle logout so a
  // leaked-then-signed-out token doesn't stay valid until TTL; audit M2).
  revokeSelf: () => request('auth/token/revoke-self', { method: 'POST' }),

  // --- leases ---
  leases: (prefix: string) =>
    requestData<{ keys: string[] }>(`sys/leases/lookup/${segPath(prefix)}`, { params: { list: true } }),
  leaseLookup: (lease_id: string) =>
    requestData('sys/leases/lookup', { method: 'PUT', body: { lease_id } }),
  revokeLease: (lease_id: string) =>
    request('sys/leases/revoke', { method: 'PUT', body: { lease_id } }),
  revokeLeasePrefix: (prefix: string) =>
    request(`sys/leases/revoke-prefix/${segPath(prefix)}`, { method: 'PUT' }),

  // --- approle --- (mount + role name are URL-encoded)
  approleRoles: (mount: string) =>
    requestData<{ keys: string[] }>(`auth/${seg(mount)}/role`, { params: { list: true } }),
  approleRole: (mount: string, name: string) => requestData(`auth/${seg(mount)}/role/${seg(name)}`),
  approleWriteRole: (mount: string, name: string, body: Record<string, unknown>) =>
    request(`auth/${seg(mount)}/role/${seg(name)}`, { method: 'POST', body }),
  approleDeleteRole: (mount: string, name: string) =>
    request(`auth/${seg(mount)}/role/${seg(name)}`, { method: 'DELETE' }),
  approleRoleId: (mount: string, name: string) =>
    requestData<{ role_id: string }>(`auth/${seg(mount)}/role/${seg(name)}/role-id`),
  approleGenerateSecretId: (mount: string, name: string) =>
    requestData<{ secret_id: string; secret_id_accessor: string }>(
      `auth/${seg(mount)}/role/${seg(name)}/secret-id`,
      { method: 'POST', body: {} },
    ),
  approleSecretIdAccessors: (mount: string, name: string) =>
    requestData<{ keys: string[] }>(`auth/${seg(mount)}/role/${seg(name)}/secret-id`, { params: { list: true } }),
  approleDestroySecretId: (mount: string, name: string, accessor: string) =>
    request(`auth/${seg(mount)}/role/${seg(name)}/secret-id-accessor/destroy`, {
      method: 'POST',
      body: { secret_id_accessor: accessor },
    }),

  // --- auth: userpass ---
  userpassLogin: (mount: string, username: string, password: string) =>
    request<{ auth: import('./types').AuthResponse }>(`auth/${seg(mount)}/login/${seg(username)}`, {
      method: 'POST',
      body: { password },
      auth: false,
    }),

  // --- auth: oidc ---
  oidcAuthUrl: (mount: string, role: string, redirectUri: string, clientNonce: string) =>
    requestData<{ auth_url: string }>(`auth/${mount}/oidc/auth_url`, {
      method: 'POST',
      auth: false,
      body: { role, redirect_uri: redirectUri, client_nonce: clientNonce },
    }),
  oidcCallback: (mount: string, params: Record<string, string>) =>
    request<{ auth: import('./types').AuthResponse }>(`auth/${mount}/oidc/callback`, {
      auth: false,
      params,
    }),
}
