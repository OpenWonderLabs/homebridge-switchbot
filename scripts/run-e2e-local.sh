#!/usr/bin/env bash
# Wrapper to run the repository's E2E vitest harness locally.
# Usage: export HB_URL HB_TOKEN [LIGHT_ACCESSORY_ID ...]; export RUN_E2E=1; bash scripts/run-e2e-local.sh

set -euo pipefail

: ${RUN_E2E:=1}

echo "Running E2E vitest harness (RUN_E2E=${RUN_E2E})"

# Run only the e2e spec file so the full unit test suite isn't executed
npx vitest run test/e2e/run-e2e.spec.ts

echo "E2E harness finished. Check logs for per-script output."
