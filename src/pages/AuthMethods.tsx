// Auth methods: list enabled backends (sys/auth) and manage them — enable a new
// method or disable an existing one. Mirrors `bao auth enable/disable/list`.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { MountMap } from '../lib/types'
import { Badge, Button, ErrorBox, Field, Input, Modal, Spinner, useToast } from '../components/ui'

const COMMON_TYPES = ['userpass', 'approle', 'oidc', 'jwt', 'ldap', 'kubernetes', 'cert', 'token']

export default function AuthMethods() {
  const qc = useQueryClient()
  const toast = useToast()
  const [enabling, setEnabling] = useState(false)
  const [type, setType] = useState('userpass')
  const [path, setPath] = useState('userpass')
  const [description, setDescription] = useState('')

  const { data, isLoading, error } = useQuery<MountMap>({
    queryKey: ['auth-mounts'],
    queryFn: () => api.authMounts() as Promise<MountMap>,
  })

  const enable = useMutation({
    mutationFn: () => api.enableAuth(path.trim(), { type: type.trim(), description }),
    onSuccess: () => {
      toast('Auth method enabled', 'ok')
      setEnabling(false)
      setDescription('')
      qc.invalidateQueries({ queryKey: ['auth-mounts'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Enable failed', 'bad'),
  })

  const disable = useMutation({
    mutationFn: (p: string) => api.disableAuth(p),
    onSuccess: () => {
      toast('Auth method disabled', 'ok')
      qc.invalidateQueries({ queryKey: ['auth-mounts'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Disable failed', 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Auth methods</h1>
          <div className="page-sub">Enabled authentication backends</div>
        </div>
        <Button variant="primary" onClick={() => setEnabling(true)}>
          + Enable method
        </Button>
      </div>
      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {Object.entries(data || {}).map(([p, m]) => {
            const isToken = m.type === 'token'
            return (
              <div className="row" key={p}>
                <div className="row-main">
                  <span className="row-icon">🛂</span>
                  <div>
                    <div className="row-title">{p}</div>
                    <div className="row-sub">{m.description || 'no description'}</div>
                  </div>
                </div>
                <div className="row-actions">
                  <Badge tone="neutral">{m.type}</Badge>
                  {!isToken && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (confirm(`Disable auth method "${p}"? Tokens issued by it stop working.`))
                          disable.mutate(p.replace(/\/$/, ''))
                      }}
                    >
                      Disable
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {enabling && (
        <Modal
          title="Enable auth method"
          onClose={() => setEnabling(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEnabling(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={enable.isPending} disabled={!type.trim() || !path.trim()} onClick={() => enable.mutate()}>
                Enable
              </Button>
            </>
          }
        >
          <Field label="Type">
            <Input list="auth-types" value={type} onChange={(e) => { setType(e.target.value); setPath(e.target.value) }} />
            <datalist id="auth-types">
              {COMMON_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Mount path" hint="Where the method is mounted (defaults to the type).">
            <Input value={path} onChange={(e) => setPath(e.target.value)} />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
