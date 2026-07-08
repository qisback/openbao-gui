// Utility tools backed by OpenBao's sys endpoints:
//  - Unwrap / Lookup / Rewrap response-wrapping tokens (secure secret handoff)
//  - Generate random bytes (sys/tools/random)
//  - Hash input (sys/tools/hash)
// These use the generic api.request/requestData so the page is self-contained.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button, Card, Field, Input, Textarea, useToast } from '../components/ui'

type Tab = 'unwrap' | 'random' | 'hash'

export default function Tools() {
  const [tab, setTab] = useState<Tab>('unwrap')
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tools</h1>
          <div className="page-sub">Response wrapping and cryptographic helpers</div>
        </div>
        <div className="tabs" style={{ margin: 0, width: 320 }}>
          <button className={`tab ${tab === 'unwrap' ? 'active' : ''}`} onClick={() => setTab('unwrap')}>
            Unwrap
          </button>
          <button className={`tab ${tab === 'random' ? 'active' : ''}`} onClick={() => setTab('random')}>
            Random
          </button>
          <button className={`tab ${tab === 'hash' ? 'active' : ''}`} onClick={() => setTab('hash')}>
            Hash
          </button>
        </div>
      </div>
      {tab === 'unwrap' && <Unwrap />}
      {tab === 'random' && <Random />}
      {tab === 'hash' && <Hash />}
    </div>
  )
}

function Unwrap() {
  const toast = useToast()
  const [token, setToken] = useState('')
  const [result, setResult] = useState<unknown>(null)

  const lookup = useMutation({
    mutationFn: () => api.requestData('sys/wrapping/lookup', { method: 'POST', body: { token: token.trim() }, auth: false }),
    onSuccess: (d) => setResult({ lookup: d }),
    onError: (e) => toast(e instanceof Error ? e.message : 'Lookup failed', 'bad'),
  })
  const unwrap = useMutation({
    mutationFn: () => api.request('sys/wrapping/unwrap', { method: 'POST', body: { token: token.trim() }, auth: false }),
    onSuccess: (d) => setResult(d),
    onError: (e) => toast(e instanceof Error ? e.message : 'Unwrap failed', 'bad'),
  })
  const rewrap = useMutation({
    mutationFn: () => api.request('sys/wrapping/rewrap', { method: 'POST', body: { token: token.trim() } }),
    onSuccess: (d) => setResult(d),
    onError: (e) => toast(e instanceof Error ? e.message : 'Rewrap failed', 'bad'),
  })

  return (
    <Card>
      <Field label="Wrapping token" hint="A single-use response-wrapping token. Unwrap reveals the wrapped data once.">
        <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="hvs.CAES..." className="mono" />
      </Field>
      <div className="btn-row">
        <Button variant="ghost" loading={lookup.isPending} disabled={!token.trim()} onClick={() => lookup.mutate()}>
          Lookup
        </Button>
        <Button variant="subtle" loading={rewrap.isPending} disabled={!token.trim()} onClick={() => rewrap.mutate()}>
          Rewrap
        </Button>
        <Button variant="primary" loading={unwrap.isPending} disabled={!token.trim()} onClick={() => unwrap.mutate()}>
          Unwrap
        </Button>
      </div>
      {result != null && (
        <pre className="mono mt" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12.5 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </Card>
  )
}

function Random() {
  const toast = useToast()
  const [bytes, setBytes] = useState('32')
  const [format, setFormat] = useState<'base64' | 'hex'>('base64')
  const [out, setOut] = useState('')
  const gen = useMutation({
    mutationFn: () =>
      api.requestData<{ random_bytes: string }>(`sys/tools/random/${Number(bytes) || 32}`, {
        method: 'POST',
        body: { format },
      }),
    onSuccess: (d) => setOut(d.random_bytes),
    onError: (e) => toast(e instanceof Error ? e.message : 'Failed', 'bad'),
  })
  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Bytes">
          <Input type="number" value={bytes} onChange={(e) => setBytes(e.target.value)} />
        </Field>
        <Field label="Format">
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${format === 'base64' ? 'active' : ''}`} onClick={() => setFormat('base64')}>
              base64
            </button>
            <button className={`tab ${format === 'hex' ? 'active' : ''}`} onClick={() => setFormat('hex')}>
              hex
            </button>
          </div>
        </Field>
      </div>
      <Button variant="primary" loading={gen.isPending} onClick={() => gen.mutate()}>
        Generate
      </Button>
      {out && (
        <Field label="Output">
          <Input readOnly value={out} className="mono" onFocus={(e) => e.currentTarget.select()} />
        </Field>
      )}
    </Card>
  )
}

function Hash() {
  const toast = useToast()
  const [algo, setAlgo] = useState('sha2-256')
  const [format, setFormat] = useState<'hex' | 'base64'>('hex')
  const [input, setInput] = useState('')
  const [out, setOut] = useState('')
  const run = useMutation({
    mutationFn: () =>
      api.requestData<{ sum: string }>(`sys/tools/hash/${algo}`, {
        method: 'POST',
        body: { input: btoa(input), format },
      }),
    onSuccess: (d) => setOut(d.sum),
    onError: (e) => toast(e instanceof Error ? e.message : 'Failed', 'bad'),
  })
  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Algorithm">
          <Input list="hash-algos" value={algo} onChange={(e) => setAlgo(e.target.value)} />
          <datalist id="hash-algos">
            {['sha2-224', 'sha2-256', 'sha2-384', 'sha2-512'].map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Format">
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${format === 'hex' ? 'active' : ''}`} onClick={() => setFormat('hex')}>
              hex
            </button>
            <button className={`tab ${format === 'base64' ? 'active' : ''}`} onClick={() => setFormat('base64')}>
              base64
            </button>
          </div>
        </Field>
      </div>
      <Field label="Input" hint="Hashed as-is (encoded to base64 for the API).">
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} style={{ minHeight: 100 }} />
      </Field>
      <Button variant="primary" loading={run.isPending} disabled={!input} onClick={() => run.mutate()}>
        Hash
      </Button>
      {out && (
        <Field label="Digest">
          <Input readOnly value={out} className="mono" onFocus={(e) => e.currentTarget.select()} />
        </Field>
      )}
    </Card>
  )
}
