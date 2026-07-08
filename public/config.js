// Runtime configuration. In development this default is used; in the container
// the entrypoint rewrites apiBase from the BAO_ADDR env var before nginx starts.
// Kept as a plain script (not a module) so it is available before the bundle loads.
window.OPENBAO_GUI_CONFIG = {
  // Base address of the OpenBao HTTP API. Empty string => same origin (uses the
  // dev proxy). In production this is set to the OpenBao public address.
  apiBase: '',
  // OIDC auth mount path (OpenBao: `bao auth enable oidc` => "oidc").
  oidcMount: 'oidc',
  // Default OIDC role to log in with.
  oidcRole: 'operator',
};
