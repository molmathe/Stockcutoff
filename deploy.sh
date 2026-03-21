#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== Pulling latest code ==="
git pull origin main

echo "=== Building and restarting containers ==="
docker compose up -d --build

echo "=== Checking status ==="
sleep 5
docker compose ps

echo "=== Backend logs ==="
docker compose logs backend --tail=5
