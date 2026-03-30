#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install with: npm install -g pnpm"
  exit 1
fi

pnpm install
pnpm lint
pnpm test
pnpm build
