# Server Setup & Deployment Plan (Ubuntu + Docker + Cloudflare Tunnel)

This plan outlines the steps to prepare a fresh Ubuntu server, deploy the Stockcutoff application using Docker Compose, and expose it to the internet securely via a Cloudflare Tunnel.

## User Review Required

> [!IMPORTANT]
> - You will need a **Cloudflare account** with a domain added to it.
> - You must create a **Cloudfare Tunnel** in the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) and obtain a **Tunnel Token**.
> - Ensure your server's firewall (ufw) is configured, although Cloudflare Tunnel does not require opening any *inbound* ports (only outbound 443).

## Proposed Changes

### 1. Server Initialization (Ubuntu)
Standard procedure to install Docker Engine and Docker Compose on a fresh Ubuntu instance.

```bash
# Update and install dependencies
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Set up the repository
echo \
  "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update

# Install Docker Engine and Compose
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify installation
sudo docker compose version
```

### 2. Project Setup
Prepare the directory and environment variables.

#### [MODIFY] [.env](file:///Users/ichitunkk/Developer/Repository/Stockcutoff/.env) (Example for Production)
We will create a production-ready `.env` file on the server.

```env
DB_PASSWORD=your_secure_db_password
JWT_SECRET=your_long_random_jwt_secret
FRONTEND_URL=https://your-domain.com
TUNNEL_TOKEN=your_cloudflare_tunnel_token
```

### 3. Docker Compose Enhancement
We will add the `cloudflared` service to the existing `docker-compose.yml` to handle the tunnel connection automatically.

#### [MODIFY] [docker-compose.yml](file:///Users/ichitunkk/Developer/Repository/Stockcutoff/docker-compose.yml)
Update to include the tunnel service:

```yaml
  # ... existing services (postgres, backend, frontend, nginx) ...

  tunnel:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
    depends_on:
      - nginx
    networks:
      - app_net
```

### 4. Deployment Steps

1.  **Transfer code**: Use `git clone` or `scp` to move the project to the server.
2.  **Config**: Create `.env` based on `.env.example`.
3.  **Start**: `sudo docker compose up -d --build`
4.  **Seed**: `sudo docker compose exec backend npm run db:seed` (if first time).

## Open Questions

- Do you already have a **Cloudflare Tunnel Token**?
- Would you like me to create a helper shell script (e.g., `setup-server.sh`) in the repository to automate the Ubuntu setup?

## Verification Plan

### Automated Tests
- `docker compose ps` to ensure all 5 services (postgres, backend, frontend, nginx, tunnel) are running.
- `docker compose logs tunnel` to check for "Connected" status.

### Manual Verification
- Access the application via your Cloudflare-assigned domain.
- Test login with default credentials.
- Verify image uploads and report generation on the server environment.
