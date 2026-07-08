import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import OidcCallback from './pages/OidcCallback'
import Dashboard from './pages/Dashboard'
import Secrets from './pages/Secrets'
import AuthMethods from './pages/AuthMethods'
import AppRole from './pages/AppRole'
import Policies from './pages/Policies'
import PolicyEdit from './pages/PolicyEdit'
import Access from './pages/Access'
import Audit from './pages/Audit'
import Tokens from './pages/Tokens'
import Leases from './pages/Leases'
import Raft from './pages/Raft'
import Tools from './pages/Tools'
import Seal from './pages/Seal'
import NotFound from './pages/NotFound'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <FullPageSpinner />
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

function FullPageSpinner() {
  return (
    <div className="center-page">
      <Spinner size={28} />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/oidc/callback" element={<OidcCallback />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/secrets" element={<Secrets />} />
        <Route path="/secrets/:mount/*" element={<Secrets />} />
        <Route path="/auth" element={<AuthMethods />} />
        <Route path="/approle" element={<AppRole />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/policies/:name" element={<PolicyEdit />} />
        <Route path="/access" element={<Access />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/tokens" element={<Tokens />} />
        <Route path="/leases" element={<Leases />} />
        <Route path="/raft" element={<Raft />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/seal" element={<Seal />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
