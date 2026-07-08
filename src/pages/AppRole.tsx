// AppRole management — the estate's machine-auth backbone (every stack agent
// authenticates via AppRole). Lists roles on an approle mount; per role you can
// read the role_id, generate a fresh secret_id (shown once, copyable), view and
// destroy secret-id accessors, edit the role's token policy/TTLs, and delete it.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { copySensitive } from '../lib/clipboard'
import type { MountMap } from '../lib/types'
import { Button, Card, ErrorBox, Field, Input, Modal, Spinner, useToast } from '../components/ui'

interface RoleConfig {
  token_policies?: string[]
  token_ttl?: number
  token_max_ttl?: number
  secret_id_ttl?: number
  secret_id_num_uses?: number
  token_num_uses?: number
}

function CopyField({ label, value }: { label: string; value: string }) {
  const toast = useToast()
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="mono" />
        <Button
          variant="subtle"
          onClick={() => copySensitive(value).then((ok) => toast(ok ? 'Copied — clears in 45s' : 'Copy failed', ok ? 'ok' : 'bad'))}
        >
          Copy
        </Button>
      </div>
    </Field>
  )
}

export default function AppRole() {
  const qc = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Discover the approle mount (default "approle").
  const { data: authMounts } = useQuery<MountMap | null>({
    queryKey: ['auth-mounts'],
    queryFn: async () => {
      try {
        return (await api.authMounts()) as MountMap
      } catch {
        return null
      }
    },
  })
  const mount = (
    Object.entries(authMounts || {}).find(([, m]) => m.type === 'approle')?.[0] || 'approle/'
  ).replace(/\/$/, '')

  const roles = useQuery({
    queryKey: ['approle-roles', mount],
    queryFn: async () => {
      try {
        return await api.approleRoles(mount)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { keys: [] as string[] }
        throw e
      }
    },
  })

  const remove = useMutation({
    mutationFn: (name: string) => api.approleDeleteRole(mount, name),
    onSuccess: () => {
      toast('Role deleted', 'ok')
      setSelected(null)
      qc.invalidateQueries({ queryKey: ['approle-roles', mount] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Delete failed', 'bad'),
  })

  const names = roles.data?.keys ?? []

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">AppRole</h1>
          <div className="page-sub">Machine identities on <span className="mono">{mount}</span></div>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + New role
        </Button>
      </div>

      <ErrorBox error={roles.error} />
      {roles.isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {names.map((name) => (
            <div className="row clickable" key={name} onClick={() => setSelected(name)}>
              <div className="row-main">
                <span className="row-icon">🤖</span>
                <div className="row-title">{name}</div>
              </div>
              <div className="row-actions muted">manage →</div>
            </div>
          ))}
          {names.length === 0 && <div className="empty">No AppRole roles on this mount.</div>}
        </div>
      )}

      {selected && (
        <RoleModal
          mount={mount}
          name={selected}
          onClose={() => setSelected(null)}
          onDelete={() => {
            if (confirm(`Delete role "${selected}"? Its role_id/secret_ids stop working.`)) remove.mutate(selected)
          }}
        />
      )}

      {creating && (
        <CreateRoleModal
          mount={mount}
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false)
            qc.invalidateQueries({ queryKey: ['approle-roles', mount] })
            setSelected(name)
          }}
        />
      )}
    </div>
  )
}

function RoleModal({
  mount,
  name,
  onClose,
  onDelete,
}: {
  mount: string
  name: string
  onClose: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [newSecretId, setNewSecretId] = useState<{ secret_id: string; secret_id_accessor: string } | null>(null)

  const role = useQuery({
    queryKey: ['approle-role', mount, name],
    queryFn: () => api.approleRole(mount, name) as Promise<RoleConfig>,
  })
  const roleId = useQuery({
    queryKey: ['approle-roleid', mount, name],
    queryFn: () => api.approleRoleId(mount, name),
  })
  const accessors = useQuery({
    queryKey: ['approle-accessors', mount, name],
    queryFn: async () => {
      try {
        return await api.approleSecretIdAccessors(mount, name)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { keys: [] as string[] }
        throw e
      }
    },
  })

  const gen = useMutation({
    mutationFn: () => api.approleGenerateSecretId(mount, name),
    onSuccess: (d) => {
      setNewSecretId(d)
      qc.invalidateQueries({ queryKey: ['approle-accessors', mount, name] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Generate failed', 'bad'),
  })

  const destroy = useMutation({
    mutationFn: (accessor: string) => api.approleDestroySecretId(mount, name, accessor),
    onSuccess: () => {
      toast('Secret ID destroyed', 'ok')
      qc.invalidateQueries({ queryKey: ['approle-accessors', mount, name] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Destroy failed', 'bad'),
  })

  return (
    <Modal
      title={`Role: ${name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" onClick={onDelete}>
            Delete role
          </Button>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {roleId.data && <CopyField label="role_id" value={roleId.data.role_id} />}

      <Card className="mb">
        <div className="row-main mb" style={{ justifyContent: 'space-between', width: '100%' }}>
          <b>Secret IDs</b>
          <Button variant="primary" loading={gen.isPending} onClick={() => gen.mutate()}>
            Generate secret_id
          </Button>
        </div>
        {newSecretId && (
          <div className="mb">
            <div className="errorbox" style={{ color: 'var(--accent-2)', borderColor: 'var(--accent-dim)', background: '#0d2b24' }}>
              Copy this now — it is shown only once.
            </div>
            <CopyField label="secret_id" value={newSecretId.secret_id} />
          </div>
        )}
        <div className="list">
          {(accessors.data?.keys ?? []).map((acc) => (
            <div className="row" key={acc}>
              <div className="row-title" style={{ fontSize: 12 }}>{acc}</div>
              <Button variant="danger" onClick={() => destroy.mutate(acc)}>
                Destroy
              </Button>
            </div>
          ))}
          {(accessors.data?.keys?.length ?? 0) === 0 && <div className="empty">No active secret IDs.</div>}
        </div>
      </Card>

      <Card>
        <b>Configuration</b>
        {role.isLoading ? (
          <Spinner />
        ) : (
          <table className="kv-table mt">
            <tbody>
              <tr>
                <td className="k">token_policies</td>
                <td className="v">{(role.data?.token_policies || []).join(', ') || '—'}</td>
              </tr>
              <tr>
                <td className="k">token_ttl</td>
                <td className="v">{role.data?.token_ttl ?? '—'}</td>
              </tr>
              <tr>
                <td className="k">token_max_ttl</td>
                <td className="v">{role.data?.token_max_ttl ?? '—'}</td>
              </tr>
              <tr>
                <td className="k">secret_id_ttl</td>
                <td className="v">{role.data?.secret_id_ttl ?? '—'}</td>
              </tr>
              <tr>
                <td className="k">secret_id_num_uses</td>
                <td className="v">{role.data?.secret_id_num_uses ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </Modal>
  )
}

function CreateRoleModal({
  mount,
  onClose,
  onCreated,
}: {
  mount: string
  onClose: () => void
  onCreated: (name: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [policies, setPolicies] = useState('')
  const [tokenTtl, setTokenTtl] = useState('1h')
  const [tokenMaxTtl, setTokenMaxTtl] = useState('4h')

  const create = useMutation({
    mutationFn: () =>
      api.approleWriteRole(mount, name.trim(), {
        token_policies: policies.split(',').map((p) => p.trim()).filter(Boolean),
        token_ttl: tokenTtl || undefined,
        token_max_ttl: tokenMaxTtl || undefined,
      }),
    onSuccess: () => {
      toast('Role created', 'ok')
      onCreated(name.trim())
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Create failed', 'bad'),
  })

  return (
    <Modal
      title="New AppRole role"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Create
          </Button>
        </>
      }
    >
      <Field label="Role name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-service" autoFocus />
      </Field>
      <Field label="Token policies" hint="Comma-separated policy names.">
        <Input value={policies} onChange={(e) => setPolicies(e.target.value)} placeholder="default, my-service" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="token_ttl">
          <Input value={tokenTtl} onChange={(e) => setTokenTtl(e.target.value)} />
        </Field>
        <Field label="token_max_ttl">
          <Input value={tokenMaxTtl} onChange={(e) => setTokenMaxTtl(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
