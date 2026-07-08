// KV secrets browser with full CRUD, covering both KV v2 (versioned) and KV v1.
//
// One component drives three views off the URL (/secrets/:mount/<path...>):
//   - no mount               -> list the KV secrets engines (sys/mounts)
//   - path is a folder (/) or -> LIST keys at that path
//   - path is a leaf          -> READ the secret, with version history + edit
//
// The engine's KV version is read from its mount options; if the caller can't
// read sys/mounts we assume v2 (the estate default) and fall back to v1 on error.

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { copySensitive } from '../lib/clipboard'
import { useCapabilities } from '../lib/capabilities'
import type { KvV2Metadata, MountMap } from '../lib/types'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, Spinner, Textarea, useToast } from '../components/ui'

function useKvVersion(mount?: string) {
  const { data } = useQuery<MountMap | null>({
    queryKey: ['mounts'],
    queryFn: async () => {
      try {
        return (await api.mounts()) as MountMap
      } catch {
        return null
      }
    },
  })
  if (!mount || !data) return { version: 2 as const, mount, mounts: data ?? null }
  const m = data[`${mount}/`]
  const version = m?.options?.version === '2' ? 2 : m?.type === 'kv' && m?.options?.version !== '1' ? 2 : 1
  return { version: version as 1 | 2, mount, mounts: data }
}

export default function Secrets() {
  const params = useParams()
  const mount = params.mount
  const splat = params['*'] || ''
  const { version, mounts } = useKvVersion(mount)

  if (!mount) return <EngineList mounts={mounts} />

  const isFolder = splat === '' || splat.endsWith('/')
  return isFolder ? (
    <SecretList mount={mount} path={splat} version={version} />
  ) : (
    <SecretView mount={mount} path={splat} version={version} />
  )
}

/* ---------- engine list ---------- */
function EngineList({ mounts }: { mounts: MountMap | null }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [enabling, setEnabling] = useState(false)
  const [path, setPath] = useState('')
  const [version, setVersion] = useState<'2' | '1'>('2')
  const [description, setDescription] = useState('')
  const kv = Object.entries(mounts || {}).filter(([, m]) => m.type === 'kv' || m.type === 'generic')

  const enable = useMutation({
    mutationFn: () =>
      api.enableMount(path.trim().replace(/\/$/, ''), {
        type: 'kv',
        description,
        options: { version },
      }),
    onSuccess: () => {
      toast('Secrets engine enabled', 'ok')
      setEnabling(false)
      setPath('')
      setDescription('')
      qc.invalidateQueries({ queryKey: ['mounts'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Enable failed', 'bad'),
  })

  const disable = useMutation({
    mutationFn: (p: string) => api.disableMount(p),
    onSuccess: () => {
      toast('Secrets engine disabled', 'ok')
      qc.invalidateQueries({ queryKey: ['mounts'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Disable failed', 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Secrets</h1>
          <div className="page-sub">KV secrets engines</div>
        </div>
        <Button variant="primary" onClick={() => setEnabling(true)}>
          + Enable engine
        </Button>
      </div>
      {!mounts ? (
        <div className="empty">
          Cannot list mounts with this token. Open a known engine directly, e.g.{' '}
          <Link to="/secrets/kv/" style={{ color: 'var(--accent)' }}>
            /secrets/kv/
          </Link>
        </div>
      ) : (
        <div className="list">
          {kv.map(([path, m]) => (
            <div className="row clickable" key={path}>
              <Link className="row-main" to={`/secrets/${path.replace(/\/$/, '')}/`} style={{ textDecoration: 'none' }}>
                <span className="row-icon">🗄️</span>
                <div>
                  <div className="row-title">{path}</div>
                  <div className="row-sub">{m.description || 'kv engine'}</div>
                </div>
              </Link>
              <div className="row-actions">
                <Badge tone="neutral">kv {m.options?.version === '2' ? 'v2' : m.options?.version === '1' ? 'v1' : ''}</Badge>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(`Disable engine "${path}"? All secrets under it become inaccessible.`))
                      disable.mutate(path.replace(/\/$/, ''))
                  }}
                >
                  Disable
                </Button>
              </div>
            </div>
          ))}
          {kv.length === 0 && <div className="empty">No KV engines mounted.</div>}
        </div>
      )}

      {enabling && (
        <Modal
          title="Enable KV secrets engine"
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
          <Field label="Mount path">
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="kv" autoFocus />
          </Field>
          <Field label="KV version">
            <div className="tabs" style={{ margin: 0 }}>
              <button className={`tab ${version === '2' ? 'active' : ''}`} onClick={() => setVersion('2')}>
                v2 (versioned)
              </button>
              <button className={`tab ${version === '1' ? 'active' : ''}`} onClick={() => setVersion('1')}>
                v1
              </button>
            </div>
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  )
}

/* ---------- breadcrumbs ---------- */
function Crumbs({ mount, path }: { mount: string; path: string }) {
  const parts = path.split('/').filter(Boolean)
  let acc = ''
  return (
    <div className="breadcrumbs mb">
      <Link to="/secrets">secrets</Link>
      <span>/</span>
      <Link to={`/secrets/${mount}/`}>{mount}</Link>
      {parts.map((p, i) => {
        acc += p + (i < parts.length - 1 || path.endsWith('/') ? '/' : '')
        const isLast = i === parts.length - 1
        return (
          <span key={i} style={{ display: 'contents' }}>
            <span>/</span>
            {isLast ? <span>{p}</span> : <Link to={`/secrets/${mount}/${acc}`}>{p}</Link>}
          </span>
        )
      })}
    </div>
  )
}

/* ---------- list keys ---------- */
function SecretList({ mount, path, version }: { mount: string; path: string; version: 1 | 2 }) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [filter, setFilter] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['kv-list', version, mount, path],
    queryFn: async () => {
      try {
        return version === 2 ? await api.kvv2List(mount, path) : await api.kvv1List(mount, path)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { keys: [] as string[] }
        throw e
      }
    },
  })

  const allKeys = data?.keys ?? []
  const keys = filter ? allKeys.filter((k) => k.toLowerCase().includes(filter.toLowerCase())) : allKeys

  return (
    <div>
      <div className="page-head">
        <div>
          <Crumbs mount={mount} path={path} />
          <h1 className="page-title">{mount}/{path || ''}</h1>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + New secret
        </Button>
      </div>
      <ErrorBox error={error} />
      {allKeys.length > 8 && (
        <div className="mb">
          <Input placeholder="Filter keys…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      )}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {keys.map((k) => {
            const isDir = k.endsWith('/')
            return (
              <Link className="row clickable" key={k} to={`/secrets/${mount}/${path}${k}`}>
                <div className="row-main">
                  <span className="row-icon">{isDir ? '📁' : '🔑'}</span>
                  <div className="row-title">{k}</div>
                </div>
                <div className="row-actions muted">{isDir ? 'open →' : 'view →'}</div>
              </Link>
            )
          })}
          {keys.length === 0 && <div className="empty">No secrets at this path.</div>}
        </div>
      )}

      {creating && (
        <Modal
          title="New secret"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!newName.trim()}
                onClick={() => navigate(`/secrets/${mount}/${path}${newName.trim()}?new=1`)}
              >
                Create
              </Button>
            </>
          }
        >
          <Field label="Secret path" hint="Use a trailing / to create a nested folder path.">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-app/db" autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  )
}

/* ---------- view / edit a secret ---------- */
type KvRow = { key: string; value: string }

function SecretView({ mount, path, version }: { mount: string; path: string; version: 1 | 2 }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const isNew = new URLSearchParams(window.location.search).get('new') === '1'

  const [editing, setEditing] = useState(isNew)
  const [rows, setRows] = useState<KvRow[]>([{ key: '', value: '' }])
  const [reveal, setReveal] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | undefined>(undefined)

  const meta = useQuery<KvV2Metadata | null>({
    queryKey: ['kv-meta', mount, path],
    queryFn: async () => {
      try {
        return (await api.kvv2Metadata(mount, path)) as KvV2Metadata
      } catch {
        return null
      }
    },
    enabled: version === 2 && !isNew,
  })

  const read = useQuery({
    queryKey: ['kv-read', version, mount, path, selectedVersion],
    queryFn: async () => {
      if (version === 2) {
        const r = (await api.kvv2Read(mount, path, selectedVersion)) as {
          data: Record<string, unknown>
          metadata: { version: number; destroyed: boolean; deletion_time: string }
        }
        return { data: r.data, meta: r.metadata }
      }
      const d = (await api.kvv1Read(mount, path)) as Record<string, unknown>
      return { data: d, meta: null }
    },
    enabled: !isNew,
  })

  // Seed the editor rows from the loaded secret when entering edit mode.
  function beginEdit() {
    const d = read.data?.data ?? {}
    const seeded = Object.entries(d).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    }))
    setRows(seeded.length ? seeded : [{ key: '', value: '' }])
    setEditing(true)
  }

  const save = useMutation({
    mutationFn: (obj: Record<string, unknown>) =>
      version === 2 ? api.kvv2Write(mount, path, obj) : api.kvv1Write(mount, path, obj),
    onSuccess: () => {
      toast('Secret saved', 'ok')
      setEditing(false)
      if (isNew) navigate(`/secrets/${mount}/${path}`, { replace: true })
      qc.invalidateQueries({ queryKey: ['kv-read', version, mount, path] })
      qc.invalidateQueries({ queryKey: ['kv-meta', mount, path] })
      setSelectedVersion(undefined)
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Save failed', 'bad'),
  })

  const del = useMutation({
    mutationFn: () =>
      version === 2 ? api.kvv2DeleteLatest(mount, path) : api.kvv1Delete(mount, path),
    onSuccess: () => {
      toast('Secret deleted', 'ok')
      qc.invalidateQueries()
      navigate(`/secrets/${mount}/${path.replace(/[^/]+$/, '')}`)
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Delete failed', 'bad'),
  })

  const entries = useMemo(() => Object.entries(read.data?.data ?? {}), [read.data])
  const versionMeta = read.data?.meta
  const destroyed = versionMeta?.destroyed
  const deleted = !!versionMeta?.deletion_time
  const [asJson, setAsJson] = useState(false)

  // Gate the write/delete buttons on the token's real capabilities for this path.
  const dataPath = version === 2 ? `${mount}/data/${path}` : `${mount}/${path}`
  const caps = useCapabilities(dataPath)

  return (
    <div>
      <div className="page-head">
        <div>
          <Crumbs mount={mount} path={path} />
          <h1 className="page-title">{path.split('/').pop()}</h1>
        </div>
        <div className="btn-row">
          {!editing && !isNew && (
            <>
              <Button variant="ghost" onClick={() => setAsJson((j) => !j)}>
                {asJson ? 'Table' : 'JSON'}
              </Button>
              <Button variant="ghost" onClick={() => setReveal((r) => !r)}>
                {reveal ? 'Hide values' : 'Reveal values'}
              </Button>
              {caps.can('update') && (
                <Button variant="subtle" onClick={beginEdit}>
                  Edit
                </Button>
              )}
              {caps.can('delete') && (
                <Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>
                  Delete
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <ErrorBox error={read.error} />

      {version === 2 && meta.data && !editing && (
        <Card className="mb">
          <div className="row-main mb" style={{ justifyContent: 'space-between', width: '100%' }}>
            <b>Versions</b>
            {destroyed && <Badge tone="bad">destroyed</Badge>}
            {deleted && !destroyed && <Badge tone="warn">deleted</Badge>}
          </div>
          <div className="btn-row">
            {Object.keys(meta.data.versions)
              .map(Number)
              .sort((a, b) => b - a)
              .map((v) => {
                const cur = (selectedVersion ?? meta.data!.current_version) === v
                return (
                  <button key={v} className={`tab ${cur ? 'active' : ''}`} style={{ flex: 'none', padding: '6px 12px' }} onClick={() => setSelectedVersion(v)}>
                    v{v}
                    {v === meta.data!.current_version ? ' (current)' : ''}
                  </button>
                )
              })}
          </div>
        </Card>
      )}

      <Card>
        {read.isLoading && !isNew ? (
          <Spinner />
        ) : editing ? (
          <SecretEditor rows={rows} setRows={setRows} onSave={(obj) => save.mutate(obj)} saving={save.isPending} onCancel={() => (isNew ? navigate(-1) : setEditing(false))} />
        ) : entries.length === 0 ? (
          <div className="empty">This secret has no data.</div>
        ) : asJson ? (
          <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12.5 }}>
            {reveal ? JSON.stringify(read.data?.data ?? {}, null, 2) : '{ ••• hidden ••• }'}
          </pre>
        ) : (
          <table className="kv-table">
            <tbody>
              {entries.map(([k, v]) => {
                const str = typeof v === 'string' ? v : JSON.stringify(v)
                return (
                  <tr key={k}>
                    <td className="k">{k}</td>
                    <td className="v">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <span>{reveal ? str : '••••••••'}</span>
                        <button
                          className="reveal-btn"
                          title="Copy value (clipboard auto-clears after 45s)"
                          onClick={() =>
                            copySensitive(str).then((ok) =>
                              toast(ok ? 'Copied — clears in 45s' : 'Copy failed', ok ? 'ok' : 'bad'),
                            )
                          }
                        >
                          copy
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function SecretEditor({
  rows,
  setRows,
  onSave,
  saving,
  onCancel,
}: {
  rows: KvRow[]
  setRows: (r: KvRow[]) => void
  onSave: (obj: Record<string, unknown>) => void
  saving: boolean
  onCancel: () => void
}) {
  // Two editing modes over the same `rows` state: a key/value form and a raw
  // JSON textarea. Switching to JSON serialises the rows; switching back parses
  // the JSON into rows (invalid JSON keeps you in JSON mode with an error).
  const [mode, setMode] = useState<'form' | 'json'>('form')
  const [json, setJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  function update(i: number, patch: Partial<KvRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const rowsToObj = () => {
    const obj: Record<string, string> = {}
    for (const r of rows) if (r.key.trim()) obj[r.key.trim()] = r.value
    return obj
  }

  function toJson() {
    setJson(JSON.stringify(rowsToObj(), null, 2))
    setJsonError(null)
    setMode('json')
  }

  // Parse the JSON textarea into a plain object; returns null (and sets an error)
  // if invalid. Used both when switching back to form mode and when saving.
  function parseJson(): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(json || '{}')
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('Top-level value must be a JSON object')
      setJsonError(null)
      return parsed as Record<string, unknown>
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
      return null
    }
  }

  function fromJson(): boolean {
    const parsed = parseJson()
    if (!parsed) return false
    const next = Object.entries(parsed).map(([key, v]) => ({
      key,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    }))
    setRows(next.length ? next : [{ key: '', value: '' }])
    return true
  }

  return (
    <div>
      <div className="tabs mb" style={{ width: 200 }}>
        <button className={`tab ${mode === 'form' ? 'active' : ''}`} onClick={() => mode === 'json' && fromJson() && setMode('form')}>
          Form
        </button>
        <button className={`tab ${mode === 'json' ? 'active' : ''}`} onClick={toJson}>
          JSON
        </button>
      </div>

      {mode === 'form' ? (
        <div className="grid" style={{ gap: 10 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
              <Input placeholder="key" value={r.key} onChange={(e) => update(i, { key: e.target.value })} />
              <Input placeholder="value" value={r.value} onChange={(e) => update(i, { value: e.target.value })} />
              <button className="icon-btn" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} aria-label="remove">
                ✕
              </button>
            </div>
          ))}
          <div>
            <Button variant="ghost" onClick={() => setRows([...rows, { key: '', value: '' }])}>
              + Add field
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Textarea value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} style={{ minHeight: 200 }} />
          {jsonError && <div className="errorbox">{jsonError}</div>}
        </div>
      )}

      <div className="btn-row mt">
        <div className="spacer" />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saving}
          onClick={() => {
            // Compute the payload directly from whichever mode is active, so we
            // never race React's async row state.
            if (mode === 'json') {
              const obj = parseJson()
              if (obj) onSave(obj)
            } else {
              onSave(rowsToObj())
            }
          }}
        >
          Save secret
        </Button>
      </div>
    </div>
  )
}
