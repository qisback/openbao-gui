#!/bin/sh
# Renders /config.js from environment at container start so the same image can be
# pointed at any OpenBao without a rebuild, and syncs the CSP connect-src to the
# configured API origin. Runs via nginx's /docker-entrypoint.d before nginx starts.
set -eu

: "${BAO_ADDR:=}"          # e.g. https://openbao.example
: "${OIDC_MOUNT:=oidc}"
: "${OIDC_ROLE:=operator}"

# Validate inputs (audit M7): BAO_ADDR must be empty or a clean http(s) URL with no
# characters that could break out of the JS string / CSP. OIDC_* must be simple
# identifiers. Reject anything else rather than interpolate it.
if [ -n "$BAO_ADDR" ]; then
  case "$BAO_ADDR" in
    https://*|http://*)
      case "$BAO_ADDR" in
        *[\'\"\\\<\>\ ]*) echo "FATAL: BAO_ADDR contains illegal characters" >&2; exit 1 ;;
      esac ;;
    *) echo "FATAL: BAO_ADDR must start with http:// or https://" >&2; exit 1 ;;
  esac
fi
case "$OIDC_MOUNT" in *[!A-Za-z0-9_/-]*) echo "FATAL: OIDC_MOUNT invalid" >&2; exit 1 ;; esac
case "$OIDC_ROLE" in *[!A-Za-z0-9_-]*) echo "FATAL: OIDC_ROLE invalid" >&2; exit 1 ;; esac

# Values are now known-safe; write config.js.
cat > /usr/share/nginx/html/config.js <<EOF
window.OPENBAO_GUI_CONFIG = {
  apiBase: '${BAO_ADDR}',
  oidcMount: '${OIDC_MOUNT}',
  oidcRole: '${OIDC_ROLE}',
};
EOF

# Sync the CSP connect-src origin (scheme://host[:port]) to BAO_ADDR so the browser
# never blocks the API the app is pointed at. Empty BAO_ADDR => same-origin only.
ORIGIN=$(printf '%s' "$BAO_ADDR" | sed -n 's#^\(https\?://[^/]*\).*#\1#p')
CONF=/etc/nginx/conf.d/default.conf
if [ -f "$CONF" ]; then
  sed -i "s#__BAO_CSP_ORIGIN__#${ORIGIN}#g" "$CONF"
fi

echo "openbao-gui: config rendered (apiBase='${BAO_ADDR}', oidcMount='${OIDC_MOUNT}', oidcRole='${OIDC_ROLE}', csp-origin='${ORIGIN}')"
