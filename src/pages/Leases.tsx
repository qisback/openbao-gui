// Lease browser. Leases are hierarchical paths; this walks the tree from a prefix
// (default the whole store) using sys/leases/lookup LIST, lets you drill into
// folders, look up a leaf lease's detail, revoke a single lease, or revoke an
// entire prefix. Revocation is guarded because a prefix revoke can be broad.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { Button, Card, ErrorBox, Modal, Spinner, useToast } from '../components/ui'

export default function Leases() {
  const qc = useQueryClient()
  const toast = useToast()
  const [prefix, setPrefix] = useState('') // '' == root
  const [detail, setDetail] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['leases', prefix],
    queryFn: async () => {
      try {
        return await api.leases(prefix)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { keys: [] as string[] }
        throw e
      }
    },
  })

  const revokePrefix = useMutation({
    mutationFn: (p: string) => api.revokeLeasePrefix(p),
    onSuccess: () => {
      toast('Prefix revoked', 'ok')
      qc.invalidateQueries({ queryKey: ['leases'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Revoke failed', 'bad'),
  })

  const keys = list.data?.keys ?? []
  const crumbs = prefix.split('/').filter(Boolean)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="breadcrumbs mb">
            <span style={{ cursor: 'pointer' }} onClick={() => setPrefix('')}>
              leases
            </span>
            {crumbs.map((c, i) => {
              const p = crumbs.slice(0, i + 1).join('/') + '/'
              return (
                <span key={i} style={{ display: 'contents' }}>
                  <span>/</span>
                  <span style={{ cursor: 'pointer' }} onClick={() => setPrefix(p)}>
                    {c}
                  </span>
                </span>
              )
            })}
          </div>
          <h1 className="page-title">Leases</h1>
        </div>
        {prefix && (
          <Button
            variant="danger"
            loading={revokePrefix.isPending}
            onClick={() => {
              if (confirm(`Revoke ALL leases under "${prefix}"? This cannot be undone.`))
                revokePrefix.mutate(prefix.replace(/\/$/, ''))
            }}
          >
            Revoke prefix
          </Button>
        )}
      </div>

      <ErrorBox error={list.error} />
      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {keys.map((k) => {
            const isDir = k.endsWith('/')
            const full = `${prefix}${k}`
            return (
              <div
                className="row clickable"
                key={k}
                onClick={() => (isDir ? setPrefix(full) : setDetail(full))}
              >
                <div className="row-main">
                  <span className="row-icon">{isDir ? '📁' : '⏳'}</span>
                  <div className="row-title">{k}</div>
                </div>
                <div className="row-actions muted">{isDir ? 'open →' : 'detail →'}</div>
              </div>
            )
          })}
          {keys.length === 0 && <div className="empty">No leases under this prefix.</div>}
        </div>
      )}

      {detail && <LeaseDetail leaseId={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function LeaseDetail({ leaseId, onClose }: { leaseId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const info = useQuery({
    queryKey: ['lease', leaseId],
    queryFn: () => api.leaseLookup(leaseId),
  })
  const revoke = useMutation({
    mutationFn: () => api.revokeLease(leaseId),
    onSuccess: () => {
      toast('Lease revoked', 'ok')
      qc.invalidateQueries({ queryKey: ['leases'] })
      onClose()
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Revoke failed', 'bad'),
  })
  return (
    <Modal
      title="Lease"
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate()}>
            Revoke lease
          </Button>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="mono mb" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--text-dim)' }}>{leaseId}</div>
      {info.isLoading ? (
        <Spinner />
      ) : (
        <Card>
          <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12.5 }}>
            {JSON.stringify(info.data, null, 2)}
          </pre>
        </Card>
      )}
    </Modal>
  )
}
