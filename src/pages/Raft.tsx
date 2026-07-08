// Raft storage operations. Shows the cluster peer set and autopilot health,
// downloads a point-in-time snapshot straight to the browser (the estate's
// primary backup artifact), and removes a dead peer. Snapshot download uses the
// blob fetch path since the body is a gzipped stream, not JSON.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { RaftServer } from '../lib/types'
import { Badge, Button, Card, ErrorBox, Spinner, useToast } from '../components/ui'

interface AutopilotState {
  healthy?: boolean
  failure_tolerance?: number
  leader?: string
  servers?: Record<string, { healthy: boolean; status: string; name: string }>
}

export default function Raft() {
  const qc = useQueryClient()
  const toast = useToast()

  const config = useQuery({
    queryKey: ['raft-config'],
    queryFn: async () => {
      try {
        return await api.raftConfig()
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) return null // not a raft backend
        throw e
      }
    },
  })

  const autopilot = useQuery({
    queryKey: ['raft-autopilot'],
    queryFn: async () => {
      try {
        return (await api.raftAutopilotState()) as AutopilotState
      } catch {
        return null
      }
    },
  })

  const snapshot = useMutation({
    mutationFn: async () => {
      const blob = await api.raftSnapshot()
      // Trigger a browser download. Timestamp comes from the browser clock.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `openbao-raft-${stamp}.snap`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
    onSuccess: () => toast('Snapshot downloaded', 'ok'),
    onError: (e) => toast(e instanceof Error ? e.message : 'Snapshot failed', 'bad'),
  })

  const removePeer = useMutation({
    mutationFn: (id: string) => api.raftRemovePeer(id),
    onSuccess: () => {
      toast('Peer removed', 'ok')
      qc.invalidateQueries({ queryKey: ['raft-config'] })
      qc.invalidateQueries({ queryKey: ['raft-autopilot'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Remove failed', 'bad'),
  })

  const servers: RaftServer[] = config.data?.config?.servers ?? []

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Raft storage</h1>
          <div className="page-sub">Cluster peers, health, and snapshots</div>
        </div>
        <Button variant="primary" loading={snapshot.isPending} onClick={() => snapshot.mutate()}>
          ⬇ Download snapshot
        </Button>
      </div>

      <ErrorBox error={config.error} />

      {config.data === null ? (
        <div className="empty">This instance is not using raft (integrated) storage.</div>
      ) : (
        <>
          <div className="grid grid-3 mb">
            <Card>
              <div className="stat">
                <span className="stat-label">Autopilot</span>
                <div className="stat-value">
                  {autopilot.data ? (
                    <Badge tone={autopilot.data.healthy ? 'ok' : 'bad'}>
                      {autopilot.data.healthy ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
            </Card>
            <Card>
              <div className="stat">
                <span className="stat-label">Failure tolerance</span>
                <div className="stat-value">{autopilot.data?.failure_tolerance ?? '—'}</div>
              </div>
            </Card>
            <Card>
              <div className="stat">
                <span className="stat-label">Voters</span>
                <div className="stat-value">{servers.filter((s) => s.voter).length} / {servers.length}</div>
              </div>
            </Card>
          </div>

          <h3 className="mb">Peers</h3>
          {config.isLoading ? (
            <Spinner />
          ) : (
            <div className="list">
              {servers.map((s) => {
                const ap = autopilot.data?.servers?.[s.node_id]
                return (
                  <div className="row" key={s.node_id}>
                    <div className="row-main">
                      <span className="row-icon">🗄️</span>
                      <div>
                        <div className="row-title">{s.node_id}</div>
                        <div className="row-sub">{s.address}</div>
                      </div>
                    </div>
                    <div className="row-actions">
                      {s.leader && <Badge tone="ok">leader</Badge>}
                      <Badge tone={s.voter ? 'neutral' : 'warn'}>{s.voter ? 'voter' : 'non-voter'}</Badge>
                      {ap && <Badge tone={ap.healthy ? 'ok' : 'bad'}>{ap.status}</Badge>}
                      {!s.leader && (
                        <Button
                          variant="danger"
                          onClick={() => {
                            if (confirm(`Remove peer "${s.node_id}" from the raft cluster?`)) removePeer.mutate(s.node_id)
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
              {servers.length === 0 && <div className="empty">No peers reported.</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
