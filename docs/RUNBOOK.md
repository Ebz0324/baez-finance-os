# RUNBOOK — going from local to a real URL

M0's code (repo, passkey auth, Docker/Caddy/Litestream config, dormant deploy
Action) is done and verified locally. Everything below is manual — provisioning
cloud accounts and DNS isn't something that can be done from within this repo.
Do these in order once you're ready to put the app on a real domain.

## 0. Try the full container stack locally first (optional, no cloud needed)

Before touching a VPS, you can sanity-check the Dockerized stack — the same
`Dockerfile`/`docker-compose.yml` used in production — entirely on your own
machine:

```
pnpm compose:local
```

This merges `docker-compose.local.yml` over the base compose file: Caddy
serves `https://localhost` with its own local (self-signed) cert instead of
requesting one from Let's Encrypt, and Litestream is stubbed out (no R2
account needed to test this). Click through the browser's certificate warning
— that's expected for local testing.

Confirm: `curl -k https://localhost/api/health` → `{"ok":true}`, then open
`https://localhost` in a browser and register a passkey the same way you would
in production. Tear down with `pnpm compose:local:down`.

This only proves the container/Caddy plumbing works — it doesn't touch R2 or
a real domain, so it's not a substitute for the real deploy below, just a
faster feedback loop while iterating on the Dockerfile/Caddyfile.

## 1. Provision the VPS

Recommended: Hetzner CX22 (~€4-5/mo), Ubuntu 24.04, closest region to the DR/US household.

1. Create the server in the Hetzner console (or `hcloud server create` if you use their CLI).
2. Point a domain (or subdomain, e.g. `finance.yourdomain.com`) at the server's IP with an `A` record. Wait for DNS to propagate (`dig +short finance.yourdomain.com` should return the IP).
3. SSH in, install Docker + the Compose plugin:
   ```
   curl -fsSL https://get.docker.com | sh
   ```
4. Create a non-root deploy user with Docker permissions, and add its SSH public key for GitHub Actions to use later.

## 2. Cloudflare R2 (for Litestream backups)

1. Create an R2 bucket (e.g. `baez-finance-os-backups`).
2. Create an R2 API token scoped to that bucket → gives you `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
3. Note your account's R2 endpoint: `https://<account_id>.r2.cloudflarestorage.com`.

## 3. First deploy (manual, before the Action is wired up)

On the VPS, in the directory you'll deploy to:

```
git clone <this-repo-once-it-has-a-remote> .
cp .env.example .env    # fill in DOMAIN, RP_ID, ORIGIN, R2_*
docker compose up -d --build
```

Confirm:
```
curl -fsS https://<your-domain>/api/health   # {"ok":true}
```

Open the domain in a phone browser, register Eimer's and Ashley's passkeys via
the "First time on this device" section of the login screen — do this once
per device you actually use.

## 4. Create the GitHub repo and wire up the Action

1. Create an empty GitHub repo, then from the local repo:
   ```
   git remote add origin <url>
   git push -u origin main
   ```
2. In the repo's Settings → Secrets and variables → Actions, add:
   - `SSH_HOST` — the VPS IP or hostname
   - `SSH_USER` — the deploy user from step 1.4
   - `SSH_KEY` — the deploy user's private key (matching the public key on the VPS)
   - `DEPLOY_PATH` — the directory on the VPS you cloned into (step 3)
   - `DOMAIN` — the same domain as in `.env` on the VPS
3. Push to `main` — `.github/workflows/deploy.yml` will rsync the repo to the VPS and run `docker compose up -d --build`.

## 5. Confirm Litestream is actually replicating

On the VPS:
```
docker compose logs litestream --tail=50
```
Look for periodic "wrote snapshot"/"replicated" lines, no auth errors. Optionally verify a restore works in a scratch directory:
```
docker run --rm -v $(pwd)/litestream.yml:/etc/litestream.yml:ro litestream/litestream:0.3 \
  restore -o /tmp/restored.db /data/app.db
```

## Notes

- Passkeys are bound to `RP_ID` (the bare domain). If you ever change domains, existing passkeys stop working and everyone re-registers.
- Magic-link email fallback is not set up yet (deferred out of M0, see the M0 plan) — if a passkey is lost before that lands, recovery is manual (SSH in, delete the row from `webauthn_credentials`, re-register).
