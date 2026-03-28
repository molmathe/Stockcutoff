# Deployment Guide: Stockcutoff UAT

This guide covers the current UAT deployment flow:

1. Push code to the `uat` branch.
2. GitHub Actions builds backend/frontend images and pushes them to GHCR.
3. GitHub Actions SSHes into the UAT server, updates `IMAGE_TAG`, and runs `docker compose pull && docker compose up -d`.
4. After a successful deploy, GitHub Actions creates a git tag such as `uat-v0.7.0+abcdef123456.142`.

## Prerequisites

- Ubuntu 24.04+ server reachable over SSH
- Cloudflare Tunnel token
- GHCR package access for the server
- GitHub Actions secrets configured for SSH deploy

## 1. One-Time Server Setup

Copy `scripts/setup-server.sh` to the server and run it:

```bash
scp scripts/setup-server.sh fonney-pc:/tmp/setup-server.sh
ssh fonney-pc 'chmod +x /tmp/setup-server.sh && DEPLOY_PATH=/opt/stockcutoff-uat /tmp/setup-server.sh'
```

After the script finishes:

- Log out and back in once so the deployment user can run Docker without `sudo`
- Run `docker login ghcr.io` on the server with a token that can read private packages

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

## 3. Configure GitHub Actions Secrets

Set these repository secrets:

- `UAT_SSH_HOST`
- `UAT_SSH_PORT`
- `UAT_SSH_USER`
- `UAT_SSH_KEY`
- `UAT_DEPLOY_PATH`

Recommended `UAT_DEPLOY_PATH`: `/opt/stockcutoff-uat`

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
