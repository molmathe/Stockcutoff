#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Ubuntu Server Setup for Stockcutoff..."

# 1. Update system packages
echo "📦 Updating packages..."
sudo apt-get update
sudo apt-get upgrade -y

# 2. Install dependencies
echo "🛠️ Installing dependencies..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 3. Add Docker GPG key
echo "🔑 Adding Docker GPG key..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 4. Set up Docker repository
echo "📂 Setting up Docker repository..."
echo \
  "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. Install Docker Engine
echo "🐳 Installing Docker & Compose Plugin..."
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 6. Set Timezone to Asia/Bangkok
echo "🕒 Setting timezone to Asia/Bangkok..."
sudo timedatectl set-timezone Asia/Bangkok

# 7. Add current user to docker group (optional, requires relogin)
echo "👤 Adding user to docker group..."
sudo usermod -aG docker $USER

echo "✅ Setup complete!"
echo "💡 Please log out and log back in to use 'docker' command without sudo."
echo "💡 Next steps: Clone the repo, 'cp .env.example .env', fill in secrets, and run 'docker compose up -d'!"
