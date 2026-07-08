// Runtime configuration read from window.OPENBAO_GUI_CONFIG (injected by
// /config.js, which the container entrypoint rewrites from env at start).

export interface GuiConfig {
  apiBase: string
  oidcMount: string
  oidcRole: string
}

const defaults: GuiConfig = {
  apiBase: '',
  oidcMount: 'oidc',
  oidcRole: 'operator',
}

declare global {
  interface Window {
    OPENBAO_GUI_CONFIG?: Partial<GuiConfig>
  }
}

export const config: GuiConfig = {
  ...defaults,
  ...(typeof window !== 'undefined' ? window.OPENBAO_GUI_CONFIG : undefined),
}

// apiBase without a trailing slash; '' means same-origin (dev proxy).
export const apiBase = config.apiBase.replace(/\/$/, '')
