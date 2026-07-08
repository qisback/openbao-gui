// Auth context: holds the active OpenBao token + the caller's self-lookup, and
// exposes the three login flows (token, userpass, OIDC/SSO) plus logout.
//
// The token lives in sessionStorage (cleared when the tab closes) and is mirrored
// into the api module so every request carries X-Vault-Token. On mount we revive
// a stored token and validate it with lookup-self; an invalid/expired token is
// discarded so the app falls back to the login screen.
//
// Session security: idle auto-logout, an absolute session ceiling, renewable-
// token auto-renew, a server-side revoke on logout, and (for OIDC) CSRF-state
// validation on the callback.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setToken } from './api'
import { config } from './config'
import type { TokenLookup } from './types'

const STORAGE_KEY = 'openbao-gui.token'
const START_KEY = 'openbao-gui.session_start'
const NONCE_KEY = 'openbao-gui.oidc_nonce'

// Auto-logout after this much inactivity (no pointer/key/scroll). A secrets UI
// should not sit unlocked on an unattended screen.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000
// Absolute session ceiling: force re-auth after this long regardless of activity.
const MAX_SESSION_MS = 8 * 60 * 60 * 1000
// How often to check TTL/absolute-cap, and the TTL floor that triggers a renew.
const RENEW_CHECK_MS = 5 * 60 * 1000

interface AuthState {
  token: string | null
  identity: TokenLookup | null
  ready: boolean
}

interface AuthContextValue extends AuthState {
  loginWithToken: (token: string) => Promise<void>
  loginWithUserpass: (mount: string, username: string, password: string) => Promise<void>
  beginOidc: (mount?: string, role?: string) => Promise<void>
  completeOidc: (mount: string, params: Record<string, string>) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function oidcRedirectUri() {
  return `${window.location.origin}/oidc/callback`
}

// Safe read of the stored OIDC transient context (guards against a corrupt value).
function readOidcTransient(): { nonce: string; state: string; mount: string; role: string } | null {
  const stored = sessionStorage.getItem(NONCE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, identity: null, ready: false })

  // Clear local session state only (no server call).
  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(START_KEY)
    setToken(null)
    setState({ token: null, identity: null, ready: true })
  }, [])

  const applyToken = useCallback(async (token: string) => {
    setToken(token)
    const identity = (await api.lookupSelf()) as TokenLookup
    sessionStorage.setItem(STORAGE_KEY, token)
    if (!sessionStorage.getItem(START_KEY)) sessionStorage.setItem(START_KEY, String(Date.now()))
    setState({ token, identity, ready: true })
  }, [])

  // Explicit/idle logout: best-effort server-side revoke, then drop local state.
  // The revoke request captures the current token synchronously before we clear.
  const logout = useCallback(() => {
    api.revokeSelf().catch(() => {})
    clearSession()
  }, [clearSession])

  const refresh = useCallback(async () => {
    if (!state.token) return
    try {
      const identity = (await api.lookupSelf()) as TokenLookup
      setState((s) => ({ ...s, identity }))
    } catch {
      clearSession()
    }
  }, [state.token, clearSession])

  // Revive a stored token on first load (respecting the absolute session cap).
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    const start = Number(sessionStorage.getItem(START_KEY) || 0)
    if (!stored) {
      setState((s) => ({ ...s, ready: true }))
      return
    }
    if (start && Date.now() - start > MAX_SESSION_MS) {
      clearSession()
      return
    }
    setToken(stored)
    api
      .lookupSelf()
      .then((identity) => setState({ token: stored, identity: identity as TokenLookup, ready: true }))
      .catch(() => clearSession())
  }, [clearSession])

  // Idle auto-logout: reset a timer on user activity; fire logout when it lapses.
  useEffect(() => {
    if (!state.token) return
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => logout(), IDLE_TIMEOUT_MS)
    }
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [state.token, logout])

  // Periodic tick: enforce the absolute session cap, and auto-renew a renewable
  // token before it expires so an active session doesn't drop mid-task.
  useEffect(() => {
    if (!state.token) return
    const tick = async () => {
      const start = Number(sessionStorage.getItem(START_KEY) || 0)
      if (start && Date.now() - start > MAX_SESSION_MS) {
        logout()
        return
      }
      try {
        const id = state.identity
        if (id?.renewable && id.ttl > 0 && id.ttl < (RENEW_CHECK_MS / 1000) * 2) {
          await api.renewSelf()
          const identity = (await api.lookupSelf()) as TokenLookup
          setState((s) => ({ ...s, identity }))
        }
      } catch {
        /* renewal is best-effort; lookup-self elsewhere will catch a dead token */
      }
    }
    const interval = setInterval(tick, RENEW_CHECK_MS)
    return () => clearInterval(interval)
  }, [state.token, state.identity, logout])

  const loginWithToken = useCallback(
    async (token: string) => {
      // Validate against the given token before committing it.
      setToken(token)
      await api.lookupSelf(token)
      await applyToken(token)
    },
    [applyToken],
  )

  const loginWithUserpass = useCallback(
    async (mount: string, username: string, password: string) => {
      const res = await api.userpassLogin(mount, username, password)
      await applyToken(res.auth.client_token)
    },
    [applyToken],
  )

  const beginOidc = useCallback(async (mount = config.oidcMount, role = config.oidcRole) => {
    // client_nonce ties the auth_url request to the callback; we also capture the
    // `state` OpenBao embeds in the auth URL so the callback can verify it (CSRF).
    const nonce = crypto.randomUUID()
    const { auth_url } = await api.oidcAuthUrl(mount, role, oidcRedirectUri(), nonce)
    if (!auth_url) throw new Error('OpenBao did not return an auth URL (check the OIDC role/redirect URI)')
    let expectedState = ''
    try {
      expectedState = new URL(auth_url).searchParams.get('state') || ''
    } catch {
      /* leave empty; callback will reject on mismatch */
    }
    sessionStorage.setItem(NONCE_KEY, JSON.stringify({ nonce, state: expectedState, mount, role }))
    window.location.assign(auth_url)
  }, [])

  const completeOidc = useCallback(
    async (mount: string, params: Record<string, string>) => {
      const ctx = readOidcTransient()
      // CSRF: the state returned by the IdP must match the one we recorded when
      // starting the flow. Refuse the exchange otherwise (audit H1).
      if (!ctx || !ctx.state || params.state !== ctx.state) {
        sessionStorage.removeItem(NONCE_KEY)
        throw new Error('OIDC state mismatch — refusing to complete sign-in. Please start again.')
      }
      const res = await api.oidcCallback(mount, { ...params, client_nonce: ctx.nonce })
      sessionStorage.removeItem(NONCE_KEY)
      await applyToken(res.auth.client_token)
    },
    [applyToken],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loginWithToken,
      loginWithUserpass,
      beginOidc,
      completeOidc,
      logout,
      refresh,
    }),
    [state, loginWithToken, loginWithUserpass, beginOidc, completeOidc, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function storedOidcContext(): { mount: string; role: string } | null {
  return readOidcTransient()
}
