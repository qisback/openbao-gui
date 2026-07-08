// Identity management: entities and groups, with create/edit/delete.
//
// Entities are people/services; groups carry policies and (for external groups)
// map an auth-backend group alias to internal policies — this is how the estate
// binds AD groups like adm_openbao/ag_openbao to OpenBao policies. The group
// editor exposes name, type (internal/external), policies, and member entity IDs.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, Spinner, useToast } from '../components/ui'

type Kind = 'entities' | 'groups'

export default function Access() {
  const [kind, setKind] = useState<Kind>('entities')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const list = useQuery({
    queryKey: ['identity', kind],
    queryFn: async () => {
      try {
        return kind === 'entities' ? await api.entities() : await api.groups()
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { key_info: {} }
        throw e
      }
    },
  })

  const items = Object.entries(list.data?.key_info ?? {})

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Access</h1>
          <div className="page-sub">Identity entities and groups</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="tabs" style={{ margin: 0, width: 220 }}>
            <button className={`tab ${kind === 'entities' ? 'active' : ''}`} onClick={() => setKind('entities')}>
              Entities
            </button>
            <button className={`tab ${kind === 'groups' ? 'active' : ''}`} onClick={() => setKind('groups')}>
              Groups
            </button>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            + New {kind === 'entities' ? 'entity' : 'group'}
          </Button>
        </div>
      </div>

      <ErrorBox error={list.error} />
      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {items.map(([id, info]) => (
            <div className="row clickable" key={id} onClick={() => setSelected(id)}>
              <div className="row-main">
                <span className="row-icon">{kind === 'entities' ? '👤' : '👥'}</span>
                <div>
                  <div className="row-title">{info.name || id}</div>
                  <div className="row-sub">{id}</div>
                </div>
              </div>
              <div className="row-actions muted">manage →</div>
            </div>
          ))}
          {items.length === 0 && <div className="empty">No {kind}.</div>}
        </div>
      )}

      {selected && <EditModal kind={kind} id={selected} onClose={() => setSelected(null)} />}
      {creating && <EditModal kind={kind} id={null} onClose={() => setCreating(false)} />}
    </div>
  )
}

interface IdentityRecord {
  name?: string
  type?: string
  policies?: string[]
  member_entity_ids?: string[]
  disabled?: boolean
}

function EditModal({ kind, id, onClose }: { kind: Kind; id: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const isNew = id === null
  const isGroup = kind === 'groups'

  const [name, setName] = useState('')
  const [type, setType] = useState<'internal' | 'external'>('internal')
  const [policies, setPolicies] = useState('')
  const [memberIds, setMemberIds] = useState('')

  const detail = useQuery({
    queryKey: ['identity-detail', kind, id],
    queryFn: () => (isGroup ? api.group(id!) : api.entity(id!)) as Promise<IdentityRecord>,
    enabled: !isNew,
  })

  useEffect(() => {
    const d = detail.data
    if (!d) return
    setName(d.name || '')
    if (d.type === 'external' || d.type === 'internal') setType(d.type)
    setPolicies((d.policies || []).join(', '))
    setMemberIds((d.member_entity_ids || []).join(', '))
  }, [detail.data])

  const save = useMutation({
    mutationFn: () => {
      const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
      if (isGroup) {
        const body: Record<string, unknown> = { name: name.trim(), type, policies: list(policies) }
        if (type === 'internal') body.member_entity_ids = list(memberIds)
        return isNew ? api.writeGroup(body) : api.updateGroup(id!, body)
      }
      const body: Record<string, unknown> = { name: name.trim(), policies: list(policies) }
      return isNew ? api.writeEntity(body) : api.updateEntity(id!, body)
    },
    onSuccess: () => {
      toast(isNew ? 'Created' : 'Saved', 'ok')
      qc.invalidateQueries({ queryKey: ['identity', kind] })
      qc.invalidateQueries({ queryKey: ['identity-detail', kind, id] })
      onClose()
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Save failed', 'bad'),
  })

  const remove = useMutation({
    mutationFn: () => (isGroup ? api.deleteGroup(id!) : api.deleteEntity(id!)),
    onSuccess: () => {
      toast('Deleted', 'ok')
      qc.invalidateQueries({ queryKey: ['identity', kind] })
      onClose()
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Delete failed', 'bad'),
  })

  return (
    <Modal
      title={isNew ? `New ${isGroup ? 'group' : 'entity'}` : name || id || ''}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" loading={remove.isPending} onClick={() => { if (confirm('Delete this identity?')) remove.mutate() }}>
              Delete
            </Button>
          )}
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            {isNew ? 'Create' : 'Save'}
          </Button>
        </>
      }
    >
      {detail.isLoading ? (
        <Spinner />
      ) : (
        <div>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          {isGroup && (
            <Field label="Type" hint="External groups map an auth-backend group alias to policies (e.g. an AD group).">
              <div className="tabs" style={{ margin: 0 }}>
                <button className={`tab ${type === 'internal' ? 'active' : ''}`} onClick={() => setType('internal')}>
                  internal
                </button>
                <button className={`tab ${type === 'external' ? 'active' : ''}`} onClick={() => setType('external')}>
                  external
                </button>
              </div>
            </Field>
          )}
          <Field label="Policies" hint="Comma-separated policy names.">
            <Input value={policies} onChange={(e) => setPolicies(e.target.value)} placeholder="default" />
          </Field>
          {isGroup && type === 'internal' && (
            <Field label="Member entity IDs" hint="Comma-separated entity IDs (internal groups only).">
              <Input value={memberIds} onChange={(e) => setMemberIds(e.target.value)} />
            </Field>
          )}
          {!isNew && (
            <Card>
              <div className="mb"><Badge tone="neutral">{isGroup ? 'group' : 'entity'}</Badge></div>
              <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>
                {JSON.stringify(detail.data, null, 2)}
              </pre>
            </Card>
          )}
        </div>
      )}
    </Modal>
  )
}
