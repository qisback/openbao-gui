// Audit devices (sys/audit): list, enable (file or syslog), and disable. A
// secrets store should have at least one audit device; this surfaces that.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { AuditDevice } from '../lib/types'
import { Badge, Button, ErrorBox, Field, Input, Modal, Spinner, useToast } from '../components/ui'

export default function Audit() {
  const qc = useQueryClient()
  const toast = useToast()
  const [enabling, setEnabling] = useState(false)
  const [type, setType] = useState<'file' | 'syslog'>('file')
  const [path, setPath] = useState('file')
  const [filePath, setFilePath] = useState('/openbao/logs/audit.log')

  const { data, isLoading, error } = useQuery<Record<string, AuditDevice>>({
    queryKey: ['audit'],
    queryFn: async () => {
      try {
        return (await api.auditDevices()) as Record<string, AuditDevice>
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) throw e
        return {}
      }
    },
  })

  const enable = useMutation({
    mutationFn: () =>
      api.enableAudit(path.trim(), {
        type,
        options: type === 'file' ? { file_path: filePath } : {},
      }),
    onSuccess: () => {
      toast('Audit device enabled', 'ok')
      setEnabling(false)
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Enable failed', 'bad'),
  })

  const disable = useMutation({
    mutationFn: (p: string) => api.disableAudit(p),
    onSuccess: () => {
      toast('Audit device disabled', 'ok')
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Disable failed', 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Audit devices</h1>
          <div className="page-sub">Where OpenBao writes its tamper-evident audit log</div>
        </div>
        <Button variant="primary" onClick={() => setEnabling(true)}>
          + Enable device
        </Button>
      </div>
      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {Object.entries(data || {}).map(([p, d]) => (
            <div className="row" key={p}>
              <div className="row-main">
                <span className="row-icon">📝</span>
                <div>
                  <div className="row-title">{p}</div>
                  <div className="row-sub">
                    {d.description || d.options?.file_path || d.options?.address || 'no description'}
                  </div>
                </div>
              </div>
              <div className="row-actions">
                <Badge tone="neutral">{d.type}</Badge>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(`Disable audit device "${p}"?`)) disable.mutate(p.replace(/\/$/, ''))
                  }}
                >
                  Disable
                </Button>
              </div>
            </div>
          ))}
          {data && Object.keys(data).length === 0 && (
            <div className="empty">No audit devices enabled. Enable one to record all requests.</div>
          )}
        </div>
      )}

      {enabling && (
        <Modal
          title="Enable audit device"
          onClose={() => setEnabling(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEnabling(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={enable.isPending} disabled={!path.trim()} onClick={() => enable.mutate()}>
                Enable
              </Button>
            </>
          }
        >
          <Field label="Type">
            <div className="tabs" style={{ margin: 0 }}>
              <button className={`tab ${type === 'file' ? 'active' : ''}`} onClick={() => { setType('file'); setPath('file') }}>
                file
              </button>
              <button className={`tab ${type === 'syslog' ? 'active' : ''}`} onClick={() => { setType('syslog'); setPath('syslog') }}>
                syslog
              </button>
            </div>
          </Field>
          <Field label="Mount path">
            <Input value={path} onChange={(e) => setPath(e.target.value)} />
          </Field>
          {type === 'file' && (
            <Field label="File path" hint="Path inside the OpenBao server/container.">
              <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} />
            </Field>
          )}
        </Modal>
      )}
    </div>
  )
}
