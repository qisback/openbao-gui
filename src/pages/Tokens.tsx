// Token management. Tokens are listed by their accessors (auth/token/accessors),
// each looked up for display, with create and revoke. Creating a token returns
// the token value once — shown in a copyable field. Revoking is by accessor so we
// never need the token value itself.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { Badge, Button, ErrorBox, Field, Input, Modal, Spinner, useToast } from '../components/ui'

interface AccessorInfo {
  accessor: string
  display_name?: string
  policies?: string[]
  ttl?: number
  expire_time?: string | null
}

export default function Tokens() {
  const qc = useQueryClient()
  const toast = useToast()
  const [creating, setCreating] = useState(false)

  const accessors = useQuery({
    queryKey: ['token-accessors'],
    queryFn: async () => {
      try {
        return await api.tokenAccessors()
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { keys: [] as string[] }
        throw e
      }
    },
  })

  const revoke = useMutation({
    mutationFn: (accessor: string) => api.revokeAccessor(accessor),
    onSuccess: () => {
      toast('Token revoked', 'ok')
      qc.invalidateQueries({ queryKey: ['token-accessors'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Revoke failed', 'bad'),
  })

  const keys = accessors.data?.keys ?? []

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tokens</h1>
          <div className="page-sub">{keys.length} active token accessor{keys.length === 1 ? '' : 's'}</div>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Create token
        </Button>
      </div>

      <ErrorBox error={accessors.error} />
      {accessors.isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {keys.map((acc) => (
            <TokenRow key={acc} accessor={acc} onRevoke={() => revoke.mutate(acc)} />
          ))}
          {keys.length === 0 && <div className="empty">No token accessors visible to this token.</div>}
        </div>
      )}

      {creating && <CreateTokenModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['token-accessors'] }) }} />}
    </div>
  )
}

function TokenRow({ accessor, onRevoke }: { accessor: string; onRevoke: () => void }) {
  const info = useQuery({
    queryKey: ['token-accessor', accessor],
    queryFn: async () => {
      try {
        return (await api.tokenLookupAccessor(accessor)) as AccessorInfo
      } catch {
        return null // accessor may have just expired; show the bare id
      }
    },
  })
  const d = info.data
  return (
    <div className="row">
      <div className="row-main">
        <span className="row-icon">🎫</span>
        <div>
          <div className="row-title">{d?.display_name || accessor}</div>
          <div className="row-sub">
            {d ? `${(d.policies || []).join(', ') || 'no policies'}` : accessor}
          </div>
        </div>
      </div>
      <div className="row-actions">
        {d?.expire_time ? <Badge tone="neutral">expires</Badge> : d ? <Badge tone="warn">no expiry</Badge> : null}
        <Button
          variant="danger"
          onClick={() => {
            if (confirm('Revoke this token? It and its children stop working immediately.')) onRevoke()
          }}
        >
          Revoke
        </Button>
      </div>
    </div>
  )
}

function CreateTokenModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [policies, setPolicies] = useState('')
  const [ttl, setTtl] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [renewable, setRenewable] = useState(true)
  const [result, setResult] = useState<{ token: string; accessor: string } | null>(null)

  const create = useMutation({
    mutationFn: () =>
      api.createToken({
        policies: policies.split(',').map((p) => p.trim()).filter(Boolean),
        ttl: ttl || undefined,
        display_name: displayName || undefined,
        renewable,
      }),
    onSuccess: (r) => {
      setResult({ token: r.auth.client_token, accessor: r.auth.accessor })
      toast('Token created', 'ok')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Create failed', 'bad'),
  })

  return (
    <Modal
      title="Create token"
      onClose={() => {
        onDone()
        onClose()
      }}
      footer={
        result ? (
          <Button variant="primary" onClick={() => { onDone(); onClose() }}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
              Create
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div>
          <div className="errorbox" style={{ color: 'var(--accent-2)', borderColor: 'var(--accent-dim)', background: '#0d2b24' }}>
            Copy the token now — it is not shown again.
          </div>
          <Field label="token">
            <Input readOnly className="mono" value={result.token} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <Field label="accessor">
            <Input readOnly className="mono" value={result.accessor} onFocus={(e) => e.currentTarget.select()} />
          </Field>
        </div>
      ) : (
        <div>
          <Field label="Policies" hint="Comma-separated. Empty = inherit the creator's policies.">
            <Input value={policies} onChange={(e) => setPolicies(e.target.value)} placeholder="default" />
          </Field>
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ops-adhoc" />
          </Field>
          <Field label="TTL" hint="e.g. 1h, 30m. Empty = system default.">
            <Input value={ttl} onChange={(e) => setTtl(e.target.value)} />
          </Field>
          <label className="field" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={renewable} onChange={(e) => setRenewable(e.target.checked)} />
            <span className="field-label">Renewable</span>
          </label>
        </div>
      )}
    </Modal>
  )
}
