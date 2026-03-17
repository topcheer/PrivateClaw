# `@privateclaw/privateclaw-relay`

`@privateclaw/privateclaw-relay` is the standalone relay package for PrivateClaw.

It starts the local blind WebSocket relay used by the PrivateClaw provider and app, and it can optionally expose that local relay to the public internet with one command through:

- Tailscale Funnel
- Cloudflare quick tunnels

## Install

```bash
npm install -g @privateclaw/privateclaw-relay
```

Or run it directly without a global install:

```bash
npx @privateclaw/privateclaw-relay
```

## Usage

Start a local relay with the default `127.0.0.1:8787` binding:

```bash
privateclaw-relay
```

If the default local port `8787` is already occupied, the CLI automatically retries the next free port and prints the final listening URL.

Start the relay and serve the bundled PrivateClaw website from the same process:

```bash
privateclaw-relay --web
```

With `--web`, the relay serves the marketing homepage at `/`, the web chat at `/chat/`, and keeps the relay WebSocket endpoints on `/ws/*` unchanged.

Override the bind address or Redis URL:

```bash
privateclaw-relay --host 0.0.0.0 --port 8787
privateclaw-relay --redis-url redis://127.0.0.1:6379
```

Expose the local relay to the internet through Tailscale Funnel:

```bash
privateclaw-relay --public tailscale
```

Expose the local relay through a temporary Cloudflare quick tunnel:

```bash
privateclaw-relay --public cloudflare
```

You can combine `--web` with public exposure so the public tunnel opens both the website and the relay on one origin:

```bash
privateclaw-relay --web --public cloudflare
privateclaw-relay --web --public tailscale
```

If the required `tailscale` or `cloudflared` CLI is missing, `privateclaw-relay` prints platform-aware install commands. In an interactive terminal it can also offer to run the supported install/setup commands for you before retrying the tunnel startup.
After the relay gets a public URL, it also prints the exact `openclaw` commands needed to point PrivateClaw at that relay. If `openclaw` is installed locally, the CLI can offer to run the local provider install/enable/config flow, restart the OpenClaw gateway, verify that `privateclaw` is now registered, and then optionally start a new group pairing. When `--web` is enabled, it can open the bundled web chat with the fresh invite prefilled.

## Tunnel notes

### Tailscale Funnel

- Requires the `tailscale` CLI to be installed and authenticated locally.
- Requires Funnel to be enabled for your tailnet.
- The CLI uses `tailscale funnel --bg <port>` and prints the detected public URL when available.
- If this CLI created the Funnel endpoint itself, it will try to disable it again on shutdown with `tailscale funnel off`.
- If `tailscale` is missing, the CLI can offer Homebrew / winget / Linux installer guidance and, on supported setups, run the install flow interactively before retrying Funnel startup.

### Cloudflare Tunnel

- Requires the `cloudflared` CLI to be installed locally.
- Uses a temporary quick tunnel with `cloudflared tunnel --url http://127.0.0.1:<port>`.
- Quick tunnels use a random `trycloudflare.com` URL and are intended for temporary sharing and testing.
- If `cloudflared` is missing, the CLI prints platform-aware install guidance and can offer an interactive install on supported setups such as Homebrew or winget.

## Environment variables

The relay still reads its runtime config from the process environment:

- `PRIVATECLAW_RELAY_HOST`
- `PRIVATECLAW_RELAY_PORT`
- `PRIVATECLAW_SESSION_TTL_MS`
- `PRIVATECLAW_FRAME_CACHE_SIZE`
- `PRIVATECLAW_RELAY_INSTANCE_ID`
- `PRIVATECLAW_REDIS_URL`
- `REDIS_URL`
- `PRIVATECLAW_FCM_SERVICE_ACCOUNT_JSON`
- `PRIVATECLAW_FCM_PROJECT_ID`
- `PRIVATECLAW_FCM_CLIENT_EMAIL`
- `PRIVATECLAW_FCM_PRIVATE_KEY`

See the repository root `README.md` for the larger deployment story, Docker images, Railway configs, and Redis-backed HA notes.
