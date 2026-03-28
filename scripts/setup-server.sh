#!/bin/bash

set -euo pipefail

TARGET_USER="${SUDO_USER:-$USER}"
TARGET_GROUP="$(id -gn "$TARGET_USER")"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/stockcutoff-uat}"

echo "Starting Ubuntu server setup for Stockcutoff UAT..."

echo "Updating packages..."
sudo apt-get update
sudo apt-get upgrade -y

echo "Installing dependencies..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release

echo "Adding Docker GPG key..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "Setting up Docker repository..."
echo \
  "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "Installing Docker Engine and Compose plugin..."
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "Setting timezone to Asia/Bangkok..."
sudo timedatectl set-timezone Asia/Bangkok

echo "Adding $TARGET_USER to docker group..."
sudo usermod -aG docker "$TARGET_USER"

echo "Creating deployment directory at $DEPLOY_PATH..."
sudo install -d -m 0755 -o "$TARGET_USER" -g "$TARGET_GROUP" "$DEPLOY_PATH"
sudo install -d -m 0755 -o "$TARGET_USER" -g "$TARGET_GROUP" "$DEPLOY_PATH/nginx"

echo "Verifying Docker installation..."
sudo docker compose version

cat <<EOF
Setup complete.

Next steps:
1. Log out and log back in so $TARGET_USER can run docker without sudo.
2. Create $DEPLOY_PATH/.env with DB_PASSWORD, JWT_SECRET, FRONTEND_URL, TUNNEL_TOKEN, PORT, and IMAGE_TAG.
3. Run 'docker login ghcr.io' on the server once with a token that can read private packages.
4. Install and register the GitHub self-hosted runner on this server for the repository.
5. Push to the uat branch to trigger build, deploy, and git tagging.
EOF
