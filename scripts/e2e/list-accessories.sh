#!/usr/bin/env bash
# List accessories from Homebridge UI and print name, aid/UUID, and context.deviceId
# Usage:
#   export HB_URL=http://localhost:8581
#   export HB_TOKEN=your_token
#   bash scripts/e2e/list-accessories.sh

set -euo pipefail

: ${HB_URL:="http://localhost:8581"}
: ${HB_TOKEN:=""}

if [[ -z "$HB_TOKEN" ]]; then
  echo "Please set HB_TOKEN environment variable (Homebridge UI token)."
  exit 1
fi

resp=$(curl -sS -H "Authorization: Bearer ${HB_TOKEN}" "${HB_URL}/api/accessories")
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(0,'utf8'));const arr=Array.isArray(j)?j:(j.accessories||j)||[];console.log('Name | aid/UUID | context.deviceId');for(const a of arr){const name=a.displayName||a.name||'(unknown)';const id=a.aid||a.UUID||'';const ctx=(a.context&&a.context.deviceId)||'';console.log(`${name} | ${id} | ${ctx}`);}" <<< "$resp"
