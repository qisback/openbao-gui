// Seal / Unseal operations. Sealing needs a privileged token; unsealing is
// unauthenticated and accepts one Shamir key share at a time, showing progress
// toward the threshold. Sealing is guarded by a typed confirmation because it
// takes the whole instance offline.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { SealStatus } from '../lib/types'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, useToast } from '../components/ui'

export default function Seal() {
  const qc = useQueryClient()
  const toast = useToast()
  const [key, setKey] = useState('')
  const [confirmSeal, setConfirmSeal] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const { data: status } = useQuery<SealStatus>({
    queryKey: ['seal-status'],
    queryFn: () => api.sealStatus() as Promise<SealStatus>,
    refetchInterval: 4000,
  })

  const unseal = useMutation({
    mutationFn: (k: string) => api.unseal(k),
    onSuccess: () => {
      setKey('')
      qc.invalidateQueries({ queryKey: ['seal-status'] })
    },
  })

  const seal = useMutation({
    mutationFn: () => api.seal(),
    onSuccess: () => {
      setConfirmSeal(false)
      setConfirmText('')
      toast('Instance sealed', 'ok')
      qc.invalidateQueries({ queryKey: ['seal-status'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Seal failed', 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Seal / Unseal</h1>
          <div className="page-sub">Manage the seal that protects the master key</div>
        </div>
        {status &&
          (status.sealed ? <Badge tone="bad">Sealed</Badge> : <Badge tone="ok">Unsealed</Badge>)}
      </div>

      <div className="grid grid-2">
        <Card>
          <h3 className="mb">Status</h3>
          <table className="kv-table">
            <tbody>
              <tr>
                <td className="k">Seal type</td>
                <td className="v">{status?.type}</td>
              </tr>
              <tr>
                <td className="k">Sealed</td>
                <td className="v">{status ? String(status.sealed) : '—'}</td>
              </tr>
              <tr>
                <td className="k">Threshold</td>
                <td className="v">{status ? `${status.t} of ${status.n}` : '—'}</td>
              </tr>
              <tr>
                <td className="k">Progress</td>
                <td className="v">{status ? `${status.progress} / ${status.t}` : '—'}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card>
          {status?.sealed ? (
            <>
              <h3 className="mb">Submit unseal key</h3>
              <p className="muted mb">
                Enter one Shamir key share. {status.t} distinct shares are required; the instance unseals when
                the threshold is met.
              </p>
              <ErrorBox error={unseal.error} />
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (key.trim()) unseal.mutate(key.trim())
                }}
              >
                <Field label="Unseal key share">
                  <Input
                    type="password"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="base64 key share"
                    autoFocus
                  />
                </Field>
                <Button variant="primary" type="submit" loading={unseal.isPending} style={{ width: '100%' }}>
                  Submit share ({status.progress}/{status.t})
                </Button>
              </form>
            </>
          ) : (
            <>
              <h3 className="mb">Seal instance</h3>
              <p className="muted mb">
                Sealing discards the in-memory master key and takes OpenBao offline until it is unsealed again.
                This affects every client of this instance.
              </p>
              <Button variant="danger" onClick={() => setConfirmSeal(true)}>
                Seal now
              </Button>
            </>
          )}
        </Card>
      </div>

      {confirmSeal && (
        <Modal
          title="Seal this instance?"
          onClose={() => setConfirmSeal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmSeal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={confirmText !== 'SEAL'}
                loading={seal.isPending}
                onClick={() => seal.mutate()}
              >
                Seal instance
              </Button>
            </>
          }
        >
          <p className="mb">
            This will take OpenBao offline. It will need {status?.t} key shares to be unsealed again. Type
            <b> SEAL </b> to confirm.
          </p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="SEAL" autoFocus />
        </Modal>
      )}
    </div>
  )
}
