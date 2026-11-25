#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUADLET_DIR="$HOME/.config/containers/systemd"

mkdir -p "$QUADLET_DIR"

podman build -t localhost/bct-frontend:latest "$SCRIPT_DIR/frontend"

for f in "$SCRIPT_DIR"/*.container; do
  cp "$f" "$QUADLET_DIR/blockchain-$(basename "$f")"
done

/usr/lib/systemd/user-generators/podman-user-generator --dryrun > /dev/null

systemctl --user daemon-reload
systemctl --user restart blockchain-frontend.service
systemctl --user status blockchain-frontend.service --no-pager

podman ps

