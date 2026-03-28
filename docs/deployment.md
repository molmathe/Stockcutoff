# Deployment Guide: Stockcutoff UAT

This guide covers the current UAT deployment flow:

1. Push code to the `uat` branch.
2. GitHub Actions builds backend/frontend images and pushes them to GHCR.
3. The self-hosted runner on the UAT server checks out the repo, updates `IMAGE_TAG`, and runs `docker compose pull && docker compose up -d`.
4. After a successful deploy, GitHub Actions creates a git tag such as `uat-v0.7.0+abcdef123456.142`.

## Prerequisites

- Ubuntu 24.04+ server for UAT
- Cloudflare Tunnel token
- GHCR package access for the server
- A GitHub self-hosted runner registered to this repository on the UAT server

## 1. One-Time Server Setup

Copy `scripts/setup-server.sh` to the server and run it:

```bash
scp scripts/setup-server.sh fonney-pc:/tmp/setup-server.sh
ssh fonney-pc 'chmod +x /tmp/setup-server.sh && DEPLOY_PATH=/opt/stockcutoff-uat /tmp/setup-server.sh'
```

After the script finishes:

- Log out and back in once so the deployment user can run Docker without `sudo`
- Run `docker login ghcr.io` on the server with a token that can read private packages
- Install and register a GitHub self-hosted runner on the server

Recommended runner labels:

- `self-hosted`
- `Linux`
- `X64`
- `uat`
- `stockcutoff`

## 2. Create the Server `.env`

Create `/opt/stockcutoff-uat/.env` on the server:

```env
DB_PASSWORD=replace-with-strong-random-password
JWT_SECRET=replace-with-64-char-random-hex-string
FRONTEND_URL=https://uat.example.com
PORT=8082
IMAGE_TAG=bootstrap
TUNNEL_TOKEN=your_cloudflare_tunnel_token
```

Notes:

- `IMAGE_TAG` is updated automatically by GitHub Actions on each deploy
- `PORT` is bound to `127.0.0.1` only; internet traffic should enter through Cloudflare Tunnel

## 3. Self-Hosted Runner

The deploy job now runs directly on the UAT server through a self-hosted runner.

The runner host must have:

- access to `/opt/stockcutoff-uat`
- Docker access for the runner user
- a successful `docker login ghcr.io`

## 4. Versioning

The root `VERSION` file controls the release line used by CI/CD.

- Update `VERSION` manually when you want a new semantic version line
- A push to `uat` generates an image tag like `0.7.0-uat-abcdef123456.142`
- After deployment succeeds, the workflow creates a git tag like `uat-v0.7.0+abcdef123456.142`

## 5. First Deploy

Push the deployment changes to `uat`:

```bash
git push origin uat
```

On the first successful deploy, seed the database once:

```bash
ssh fonney-pc 'cd /opt/stockcutoff-uat && docker compose exec backend npm run db:seed'
```

## 6. Verification

Run these on the server:

```bash
cd /opt/stockcutoff-uat
docker compose ps
docker compose logs --tail=100 tunnel
curl http://127.0.0.1:8082/health
```

Then verify the UAT domain through Cloudflare.
