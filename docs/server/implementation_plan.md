# Server Setup and UAT CI/CD Plan

This document captures the deployment model currently implemented for the repository:

- UAT deploys are triggered by pushes to the `uat` branch
- GitHub Actions builds backend/frontend Docker images and pushes them to GHCR
- GitHub Actions SSHes into the UAT server and deploys the new `IMAGE_TAG`
- GitHub Actions creates an environment-specific git tag after a successful deploy

## Deployment Model

### Source of Truth

- `VERSION` controls the semantic version line
- The workflow derives:
  - image tag: `MAJOR.MINOR.PATCH-uat-<sha>.<run-number>`
  - git tag: `uat-vMAJOR.MINOR.PATCH+<sha>.<run-number>`

### Runtime Topology

- `postgres`, `backend`, `frontend`, `nginx`, and `tunnel` run via Docker Compose
- `backend` and `frontend` resolve to GHCR images tagged by CI/CD
- `nginx` binds only to `127.0.0.1:${PORT}`
- Cloudflare Tunnel is the intended public ingress path

## One-Time Server Preparation

Run `scripts/setup-server.sh` on the Ubuntu server with:

- Docker Engine
- Docker Compose plugin
- timezone set to `Asia/Bangkok`
- deployment directory created at `/opt/stockcutoff-uat`
- deployment user added to the `docker` group

After bootstrap:

1. Create `/opt/stockcutoff-uat/.env`
2. Run `docker login ghcr.io` once on the server for private image pulls
3. Confirm the Cloudflare tunnel token and UAT domain are ready

## Required Server `.env`

```env
DB_PASSWORD=replace-with-strong-random-password
JWT_SECRET=replace-with-64-char-random-hex-string
FRONTEND_URL=https://uat.example.com
PORT=8082
IMAGE_TAG=bootstrap
TUNNEL_TOKEN=your_cloudflare_tunnel_token
```

`IMAGE_TAG` is updated automatically by the workflow during each deploy.

## Required GitHub Actions Secrets

- `UAT_SSH_HOST`
- `UAT_SSH_PORT`
- `UAT_SSH_USER`
- `UAT_SSH_KEY`
- `UAT_DEPLOY_PATH`

## Workflow Responsibilities

### Build

- Validate `VERSION`
- Calculate `SHORT_SHA`, image tag, and git tag
- Build and push:
  - `ghcr.io/<owner>/stockcutoff-backend:<image-tag>`
  - `ghcr.io/<owner>/stockcutoff-frontend:<image-tag>`

### Deploy

- Copy `docker-compose.yml` and `nginx/nginx.conf` to the server
- Update `IMAGE_TAG` inside the server `.env`
- Run `docker compose pull`
- Run `docker compose up -d --remove-orphans`
- Check `http://127.0.0.1:${PORT}/health`

### Tag

- Create and push an annotated git tag after deploy succeeds

## Verification Checklist

- `docker compose ps` shows all 5 services running
- `docker compose logs tunnel` shows tunnel connectivity
- `curl http://127.0.0.1:${PORT}/health` returns success
- The UAT domain works through Cloudflare
- First-time seed is run once:

```bash
docker compose exec backend npm run db:seed
```
