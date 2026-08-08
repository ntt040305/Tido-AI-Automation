#!/usr/bin/env bash
set -euo pipefail

echo "1. Copy .env.example to .env."
echo "2. Run docker compose up -d postgres redis minio."
echo "3. Pin compatible package versions during Phase 0."
echo "4. Install JS dependencies with pnpm."
echo "5. Create Python virtual environments."
echo "6. Run schema validation, lint, typecheck and tests."
echo "7. Use mock providers before real credentials."
