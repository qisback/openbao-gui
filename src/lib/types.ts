// Shapes returned by the OpenBao HTTP API (subset used by this GUI).

export interface SealStatus {
  type: string
  initialized: boolean
  sealed: boolean
  t: number
  n: number
  progress: number
  version: string
  build_date?: string
  storage_type?: string
  cluster_name?: string
  cluster_id?: string
}

export interface HealthStatus {
  initialized: boolean
  sealed: boolean
  standby: boolean
  performance_standby?: boolean
  version: string
  cluster_name?: string
  server_time_utc?: number
}

export interface LeaderStatus {
  ha_enabled: boolean
  is_self: boolean
  leader_address?: string
  leader_cluster_address?: string
  raft_committed_index?: number
  raft_applied_index?: number
}

export interface TokenLookup {
  display_name: string
  policies: string[]
  ttl: number
  renewable: boolean
  entity_id?: string
  expire_time?: string | null
  meta?: Record<string, string> | null
  path?: string
}

// A single mount entry (secrets engine or auth method).
export interface Mount {
  type: string
  description: string
  accessor: string
  options?: Record<string, string> | null
  config?: Record<string, unknown>
}

export type MountMap = Record<string, Mount>

// KV v2 secret read result.
export interface KvV2Read {
  data: Record<string, unknown>
  metadata: {
    version: number
    created_time: string
    deletion_time: string
    destroyed: boolean
    custom_metadata?: Record<string, string> | null
  }
}

export interface KvV2Metadata {
  current_version: number
  oldest_version: number
  created_time: string
  updated_time: string
  max_versions: number
  cas_required: boolean
  versions: Record<
    string,
    { created_time: string; deletion_time: string; destroyed: boolean }
  >
  custom_metadata?: Record<string, string> | null
}

export interface AuditDevice {
  type: string
  description: string
  options?: Record<string, string> | null
  local?: boolean
}

export interface RaftServer {
  node_id: string
  address: string
  leader: boolean
  voter: boolean
  protocol_version?: string
}

export interface AuthResponse {
  client_token: string
  accessor: string
  policies: string[]
  token_policies?: string[]
  metadata?: Record<string, string> | null
  lease_duration: number
  renewable: boolean
  entity_id?: string
}
