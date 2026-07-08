// Login screen with three tabs: Token, Username (userpass), and SSO (OIDC).
// The available tabs could be trimmed to the server's enabled auth methods, but
// we always offer Token (works on any OpenBao) and surface SSO prominently since
// that is the estate's primary path.

import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { config } from '../lib/config'
import { Button, Card, ErrorBox, Field, Input } from '../components/ui'

type Tab = 'oidc' | 'token' | 'userpass'

export default function Login() {
  const { loginWithToken, loginWithUserpass, beginOidc } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string } } }
  const dest = location.state?.from?.pathname || '/'

  const [tab, setTab] = useState<Tab>('oidc')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const [token, setToken] = useState('')
  const [mount, setMount] = useState('userpass')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function run(fn: () => Promise<void>, redirect = true) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (redirect) navigate(dest, { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <Card className="login-card">
        <div className="login-brand">
          <span className="brand-mark">◈</span>
          <h1>OpenBao</h1>
          <div className="muted">Sign in to the secrets store</div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'oidc' ? 'active' : ''}`} onClick={() => setTab('oidc')}>
            SSO
          </button>
          <button className={`tab ${tab === 'token' ? 'active' : ''}`} onClick={() => setTab('token')}>
            Token
          </button>
          <button className={`tab ${tab === 'userpass' ? 'active' : ''}`} onClick={() => setTab('userpass')}>
            Username
          </button>
        </div>

        <ErrorBox error={error} />

        {tab === 'oidc' && (
          <div>
            <p className="muted mb">
              Authenticate with single sign-on via authentik. You will be redirected and returned here once
              signed in.
            </p>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => run(() => beginOidc(config.oidcMount, config.oidcRole), false)}
              style={{ width: '100%' }}
            >
              Continue with SSO
            </Button>
          </div>
        )}

        {tab === 'token' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              run(() => loginWithToken(token.trim()))
            }}
          >
            <Field label="Token" hint="A valid OpenBao token (root or any policy-bound token).">
              <Input
                type="password"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="s.xxxxxxxx or hvs...."
              />
            </Field>
            <Button variant="primary" type="submit" loading={busy} style={{ width: '100%' }}>
              Sign in
            </Button>
          </form>
        )}

        {tab === 'userpass' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              run(() => loginWithUserpass(mount.trim(), username.trim(), password))
            }}
          >
            <Field label="Mount path" hint="The userpass auth mount (default: userpass).">
              <Input value={mount} onChange={(e) => setMount(e.target.value)} />
            </Field>
            <Field label="Username">
              <Input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button variant="primary" type="submit" loading={busy} style={{ width: '100%' }}>
              Sign in
            </Button>
          </form>
        )}

        <div className="login-version">openbao-gui v{__APP_VERSION__}</div>
      </Card>
    </div>
  )
}
