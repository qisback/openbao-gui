// App shell for authenticated routes: a sidebar of sections + a top bar showing
// the live seal/HA status, a theme toggle, and the current identity, with the
// routed page rendered in the main column via <Outlet/>. On narrow screens the
// sidebar collapses into a toggled drawer.

import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { useTheme } from '../lib/theme'
import type { SealStatus } from '../lib/types'
import { Badge, Button } from './ui'

const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: '▚' },
  { to: '/secrets', label: 'Secrets', icon: '🔑' },
  { to: '/auth', label: 'Auth methods', icon: '🛂' },
  { to: '/approle', label: 'AppRole', icon: '🤖' },
  { to: '/policies', label: 'Policies', icon: '📜' },
  { to: '/access', label: 'Access', icon: '👥' },
  { to: '/tokens', label: 'Tokens', icon: '🎫' },
  { to: '/leases', label: 'Leases', icon: '⏳' },
  { to: '/audit', label: 'Audit', icon: '📝' },
  { to: '/raft', label: 'Raft storage', icon: '🗄️' },
  { to: '/tools', label: 'Tools', icon: '🧰' },
  { to: '/seal', label: 'Seal / Unseal', icon: '🔒' },
]

export function Layout() {
  const { identity, logout } = useAuth()
  const navigate = useNavigate()
  const [theme, toggleTheme] = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { data: seal } = useQuery<SealStatus>({
    queryKey: ['seal-status'],
    queryFn: () => api.sealStatus() as Promise<SealStatus>,
    refetchInterval: 15_000,
  })

  return (
    <div className="shell">
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)}>
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            <div className="brand-name">OpenBao</div>
            <div className="brand-sub">{seal?.cluster_name || 'secrets'}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="version">{seal?.version && `v${seal.version}`}</div>
        </div>
      </aside>

      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <div className="status-chips">
            <button className="icon-btn hamburger" onClick={() => setDrawerOpen((o) => !o)} aria-label="menu">
              ☰
            </button>
            {seal &&
              (seal.sealed ? (
                <Badge tone="bad">Sealed</Badge>
              ) : (
                <Badge tone="ok">Unsealed</Badge>
              ))}
            {seal?.storage_type && <Badge tone="neutral">{seal.storage_type}</Badge>}
          </div>
          <div className="identity">
            <button className="icon-btn" onClick={toggleTheme} aria-label="toggle theme" title="Toggle light/dark">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <div className="identity-text">
              <div className="identity-name">{identity?.display_name || 'token'}</div>
              <div className="identity-policies">{(identity?.policies || []).join(', ')}</div>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              Sign out
            </Button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
