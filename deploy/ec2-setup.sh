#!/usr/bin/env bash
# One-time setup on a fresh Amazon Linux 2023 EC2 instance.
# Run from the project folder after copying it to the instance:
#   bash deploy/ec2-setup.sh
set -euo pipefail

if ! command -v docker >/dev/null; then
  sudo dnf install -y docker
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -sSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env
  echo "Created .env with random secrets."
fi

sudo docker compose up -d --build
echo
echo "Running. Open http://$(curl -s http://checkip.amazonaws.com)/"
