// ACL policy list (sys/policies/acl). Click a policy to view/edit its HCL, or
// create a new one. built-in `root`/`default` are shown but root cannot be
// edited (OpenBao rejects writes to it).

import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button, ErrorBox, Spinner } from '../components/ui'

export default function Policies() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['policies'],
    queryFn: () => api.policies(),
  })

  const names = data?.keys ?? []

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Policies</h1>
          <div className="page-sub">ACL policies (HCL)</div>
        </div>
        <Button variant="primary" onClick={() => navigate('/policies/new')}>
          + New policy
        </Button>
      </div>
      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="list">
          {names.map((name) => (
            <Link className="row clickable" key={name} to={`/policies/${encodeURIComponent(name)}`}>
              <div className="row-main">
                <span className="row-icon">📜</span>
                <div className="row-title">{name}</div>
              </div>
              <div className="row-actions muted">view →</div>
            </Link>
          ))}
          {names.length === 0 && <div className="empty">No policies.</div>}
        </div>
      )}
    </div>
  )
}
