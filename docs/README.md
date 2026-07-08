# openbao-gui documentation

Full documentation for **openbao-gui**, a modern React/TypeScript web GUI for
[OpenBao](https://openbao.org).

Start here, then follow the guide that matches what you want to do.

| Guide | What it covers |
|-------|----------------|
| [Architecture](architecture.md) | How the app is put together, the request flow, and the security model. |
| [Configuration](configuration.md) | Every runtime and build-time setting (`config.js`, env vars). |
| [Authentication](authentication.md) | The three login flows (Token, Userpass, OIDC/SSO) in detail. |
| [Features](features.md) | Page-by-page reference of what the GUI does. |
| [API client](api-client.md) | The OpenBao HTTP API surface the GUI uses, and error handling. |
| [Development](development.md) | Local setup, project layout, and how to add a page or API call. |
| [Deployment](deployment.md) | Building the image and running it behind Traefik; CORS + OIDC prerequisites. |
| [Operations](operations.md) | Health checks, backups, rollback, and troubleshooting. |

Project meta: [CONTRIBUTING](../CONTRIBUTING.md) · [CHANGELOG](../CHANGELOG.md) ·
[live rollout runbook](../deploy/ROLLOUT.md).

## What this is (in one paragraph)

openbao-gui is a **standalone single-page application**. It ships as static files
served by nginx and talks **directly** to the OpenBao HTTP API from the browser.
It is *not* embedded in the OpenBao binary and shares no code with OpenBao — it is
a client, deployed alongside the server. This mirrors the direction of OpenBao's
own [RFC #1364 — Web UI Modernization](https://github.com/openbao/openbao/issues/1364),
which proposes replacing the EmberJS UI with a decoupled React/TypeScript app. The
built-in OpenBao UI at `/ui` is left untouched, so this GUI is purely additive.
