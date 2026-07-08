// View / edit / create a single ACL policy. Route param `:name` === "new" opens
// a blank editor; otherwise the current HCL is loaded for editing. `root` is
// read-only. Deleting is offered for non-builtin policies.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Button, Card, ErrorBox, Field, Input, Textarea, useToast } from '../components/ui'

const BUILTIN = new Set(['root', 'default'])

export default function PolicyEdit() {
  const { name = '' } = useParams()
  const isNew = name === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const [policyName, setPolicyName] = useState(isNew ? '' : name)
  const [hcl, setHcl] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['policy', name],
    queryFn: () => api.policy(name),
    enabled: !isNew,
  })

  useEffect(() => {
    if (data) setHcl((data as { policy: string }).policy || '')
  }, [data])

  const readOnly = name === 'root'

  const save = useMutation({
    mutationFn: () => api.writePolicy(policyName.trim(), hcl),
    onSuccess: () => {
      toast('Policy saved', 'ok')
      qc.invalidateQueries({ queryKey: ['policies'] })
      qc.invalidateQueries({ queryKey: ['policy', policyName.trim()] })
      navigate(`/policies/${encodeURIComponent(policyName.trim())}`)
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Save failed', 'bad'),
  })

  const remove = useMutation({
    mutationFn: () => api.deletePolicy(name),
    onSuccess: () => {
      toast('Policy deleted', 'ok')
      qc.invalidateQueries({ queryKey: ['policies'] })
      navigate('/policies')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Delete failed', 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="breadcrumbs mb">
            <span onClick={() => navigate('/policies')} style={{ cursor: 'pointer' }}>
              policies
            </span>
            <span>/</span>
            <span>{isNew ? 'new' : name}</span>
          </div>
          <h1 className="page-title">{isNew ? 'New policy' : name}</h1>
        </div>
        <div className="btn-row">
          {!isNew && !BUILTIN.has(name) && (
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          )}
          {!readOnly && (
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!policyName.trim() || !hcl.trim()}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          )}
        </div>
      </div>

      <ErrorBox error={error} />
      <Card>
        {isNew && (
          <Field label="Policy name">
            <Input value={policyName} onChange={(e) => setPolicyName(e.target.value)} placeholder="my-policy" autoFocus />
          </Field>
        )}
        <Field label="Policy (HCL)" hint={readOnly ? 'The built-in root policy cannot be edited.' : 'path "..." { capabilities = ["read", ...] }'}>
          <Textarea
            value={isLoading ? 'loading…' : hcl}
            onChange={(e) => setHcl(e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
          />
        </Field>
      </Card>
    </div>
  )
}
