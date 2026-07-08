// Read-only overview: seal/HA state, version/storage, mount counts and the
// caller's own token. Every query is 403-tolerant so a low-privilege token still
// renders a useful dashboard rather than an error wall (RFC #1364: don't punish
// users for permissions they lack).

import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { HealthStatus, LeaderStatus, MountMap, SealStatus } from '../lib/types'
import { Badge, Card, Spinner } from '../components/ui'

function useSafe<T>(key: string[], fn: () => Promise<T>) {
  return useQuery<T | null>({
    queryKey: key,
    queryFn: async () => {
      try {
        return await fn()
      } catch (e) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 400)) return null
        throw e
      }
    },
  })
}

export default function Dashboard() {
  const { identity } = useAuth()
  const seal = useSafe<SealStatus>(['seal-status'], () => api.sealStatus() as Promise<SealStatus>)
  const health = useSafe<HealthStatus>(['health'], () => api.health() as Promise<HealthStatus>)
  const leader = useSafe<LeaderStatus>(['leader'], () => api.leader() as Promise<LeaderStatus>)
  const mounts = useSafe<MountMap>(['mounts'], () => api.mounts() as Promise<MountMap>)
  const authMounts = useSafe<MountMap>(['auth-mounts'], () => api.authMounts() as Promise<MountMap>)

  const s = seal.data

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">{s?.cluster_name || 'OpenBao'} cluster status</div>
        </div>
      </div>

      <div className="grid grid-3 mb">
        <Card>
          <div className="stat">
            <span className="stat-label">Seal status</span>
            <div className="stat-value">
              {s ? (
                s.sealed ? (
                  <Badge tone="bad">Sealed</Badge>
                ) : (
                  <Badge tone="ok">Unsealed</Badge>
                )
              ) : (
                <Spinner />
              )}
            </div>
            {s && <span className="muted">Shamir {s.t} of {s.n}{s.sealed ? ` · ${s.progress}/${s.t}` : ''}</span>}
          </div>
        </Card>

        <Card>
          <div className="stat">
            <span className="stat-label">High availability</span>
            <div className="stat-value">
              {leader.data ? (
                leader.data.ha_enabled ? (
                  <Badge tone={leader.data.is_self ? 'ok' : 'neutral'}>
                    {leader.data.is_self ? 'Active (leader)' : 'Standby'}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Single node</Badge>
                )
              ) : (
                <span className="muted">—</span>
              )}
            </div>
            {leader.data?.raft_applied_index != null && (
              <span className="muted">raft index {leader.data.raft_applied_index}</span>
            )}
          </div>
        </Card>

        <Card>
          <div className="stat">
            <span className="stat-label">Version</span>
            <div className="stat-value small">{s?.version || health.data?.version || '—'}</div>
            <span className="muted">{s?.storage_type} storage</span>
          </div>
        </Card>

        <Card>
          <div className="stat">
            <span className="stat-label">Secrets engines</span>
            <div className="stat-value">{mounts.data ? Object.keys(mounts.data).length : <span className="muted">—</span>}</div>
            <span className="muted">mounted</span>
          </div>
        </Card>

        <Card>
          <div className="stat">
            <span className="stat-label">Auth methods</span>
            <div className="stat-value">{authMounts.data ? Object.keys(authMounts.data).length : <span className="muted">—</span>}</div>
            <span className="muted">enabled</span>
          </div>
        </Card>

        <Card>
          <div className="stat">
            <span className="stat-label">Initialized</span>
            <div className="stat-value">
              {s ? <Badge tone={s.initialized ? 'ok' : 'warn'}>{s.initialized ? 'Yes' : 'No'}</Badge> : <Spinner />}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="mb">Your token</h3>
        <table className="kv-table">
          <tbody>
            <tr>
              <td className="k">Display name</td>
              <td className="v">{identity?.display_name}</td>
            </tr>
            <tr>
              <td className="k">Policies</td>
              <td className="v">{(identity?.policies || []).join(', ') || '—'}</td>
            </tr>
            <tr>
              <td className="k">Entity ID</td>
              <td className="v">{identity?.entity_id || '—'}</td>
            </tr>
            <tr>
              <td className="k">TTL</td>
              <td className="v">{identity?.ttl ? `${identity.ttl}s` : 'unlimited'}</td>
            </tr>
            <tr>
              <td className="k">Renewable</td>
              <td className="v">{identity ? String(identity.renewable) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}
