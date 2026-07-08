// OIDC redirect landing page. authentik sends the browser back here with
// ?state=&code=; we exchange those (plus the stored client_nonce) at OpenBao's
// oidc/callback endpoint for a client token, then continue into the app.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, storedOidcContext } from '../lib/auth'
import { config } from '../lib/config'
import { Card, ErrorBox, Spinner, Button } from '../components/ui'

export default function OidcCallback() {
  const [params] = useSearchParams()
  const { completeOidc } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // StrictMode double-invoke guard: exchange the code once
    ran.current = true
    const ctx = storedOidcContext()
    const mount = ctx?.mount || config.oidcMount
    const state = params.get('state')
    const code = params.get('code')
    if (!state || !code) {
      setError(new Error('Missing state or code in the callback URL.'))
      return
    }
    completeOidc(mount, { state, code })
      .then(() => navigate('/', { replace: true }))
      .catch(setError)
  }, [params, completeOidc, navigate])

  return (
    <div className="login-wrap">
      <Card className="login-card">
        <div className="login-brand">
          <span className="brand-mark">◈</span>
          <h1>Signing in…</h1>
        </div>
        {error ? (
          <>
            <ErrorBox error={error} />
            <Button variant="primary" onClick={() => navigate('/login', { replace: true })} style={{ width: '100%' }}>
              Back to sign in
            </Button>
          </>
        ) : (
          <div className="center-page" style={{ height: 'auto', padding: 20 }}>
            <Spinner size={26} />
          </div>
        )}
      </Card>
    </div>
  )
}
