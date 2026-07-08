// Hook wrapping sys/capabilities-self so the UI can grey out actions the current
// token cannot perform (RFC #1364: don't show features users can't access). It
// asks OpenBao what the token can do on a path and returns simple booleans.
// Failures resolve to "assume allowed" so a token that can't even query
// capabilities isn't locked out of the UI — OpenBao still enforces the real ACL.

import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface Caps {
  can: (op: 'read' | 'create' | 'update' | 'delete' | 'list' | 'sudo') => boolean
  loading: boolean
}

export function useCapabilities(path: string | undefined): Caps {
  const { data, isLoading } = useQuery({
    queryKey: ['capabilities', path],
    enabled: !!path,
    queryFn: async () => {
      try {
        const r = await api.capabilitiesSelf([path!])
        // Response shape: { <path>: [...], capabilities: [...] } — prefer the
        // per-path list, fall back to the top-level one.
        const caps = (r as Record<string, string[]>)[path!] || r.capabilities || []
        return caps
      } catch {
        return null // couldn't determine — treat as allowed, let OpenBao enforce
      }
    },
  })

  const caps = data
  const can = (op: string) => {
    if (!caps) return true // unknown -> don't block; server still enforces
    if (caps.includes('root') || caps.includes('sudo')) return true
    if (caps.includes('deny')) return false
    return caps.includes(op)
  }
  return { can: can as Caps['can'], loading: isLoading }
}
