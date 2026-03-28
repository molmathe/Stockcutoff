# Deployment Guide: Stockcutoff

This guide explains how to deploy the **Stockcutoff** project on a fresh Ubuntu server using Docker and Cloudflare Tunnel.

## Prerequisites

-   A fresh Ubuntu 22.04+ server.
-   A Cloudflare account with a domain.
-   A **Tunnel Token** from the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).

## 1. Server Preparation

Run the setup script to install Docker, Docker Compose, and set the system timezone to Bangkok:

```bash
# Clone the repository
git clone https://github.com/your-username/stockcutoff.git
cd stockcutoff

# Run the setup script (Ubuntu ONLY)
chmod +x scripts/setup-server.sh
./scripts/setup-server.sh
```

> [!NOTE]
> You may need to log out and log back in for the `docker` group changes to take effect.

## 2. Configuration

Create your `.env` file from the example:

```bash
cp .env.example .env
nano .env
```

**Required Fields:**
-   `DB_PASSWORD`: A strong password for your PostgreSQL database.
-   `JWT_SECRET`: A long, random string (e.g., `openssl rand -base64 64`).
-   `FRONTEND_URL`: Your production domain (e.g., `https://stock.yourdomain.com`).
-   `TUNNEL_TOKEN`: The token provided by Cloudflare when you created the tunnel.

## 3. Starting the Services

Launch all containers in detached mode:

```bash
sudo docker compose up -d --build
```

### Initial Database Setup

If this is your first time deploying, seed the database with default accounts:

```bash
sudo docker compose exec backend npm run db:seed
```

## 4. Cloudflare Configuration

In your Cloudflare Zero Trust dashboard, ensure your tunnel is "Healthy".
Point your domain/subdomain to the **Local Service**: `http://nginx:80`.

## 5. Troubleshooting

-   **Check Logs**: `sudo docker compose logs -f`
-   **Check Tunnel**: `sudo docker compose logs -f tunnel`
-   **Rebuild**: `sudo docker compose up -d --build --force-recreate`
