#!/usr/bin/env bash
# Advanced light E2E helper: exercises On/Off, Brightness steps, Color Temperature and RGB color where supported.
# Usage:
# 1) Ensure Homebridge is running and the plugin is installed/linked.
# 2) Populate `HB_URL`, `HB_TOKEN`, and `ACCESSORY_ID` below (or export them).
# 3) Run: `bash scripts/e2e/light-advanced-e2e.sh`

set -euo pipefail

: ${HB_URL:="http://localhost:8581"}
: ${HB_TOKEN:=""}
: ${ACCESSORY_ID:=""}
: ${ACCESSORY_NAME:=""}

# Resolve accessory id (aid) from Homebridge API when ACCESSORY_NAME supplied
resolve_accessory_id() {
  if [[ -n "$ACCESSORY_ID" ]]; then
    return 0
  fi
  if [[ -z "$ACCESSORY_NAME" ]]; then
    return 1
  fi
  local resp
  resp=$(curl -sS -H "Authorization: Bearer ${HB_TOKEN}" "${HB_URL}/api/accessories") || return 1
  ACCESSORY_ID=$(printf '%s' "$resp" | node -e "const fs=require('fs');const name=process.argv[1];const j=JSON.parse(fs.readFileSync(0,'utf8'));const arr=Array.isArray(j)?j:(j.accessories||j);for(const a of arr||[]){if(a.displayName===name||a.name===name||(a.context&&a.context.deviceId===name)){if(a.aid){console.log(a.aid);process.exit(0);}else if(a.UUID){console.log(a.UUID);process.exit(0);}}}process.exit(1);" "$ACCESSORY_NAME") || return 1
  return 0
}

if [[ -z "$HB_TOKEN" ]]; then
  echo "Please set HB_TOKEN environment variable or edit the top of this script."
  exit 1
fi

if [[ -z "$ACCESSORY_ID" ]]; then
  if resolve_accessory_id; then
    echo "Discovered ACCESSORY_ID=${ACCESSORY_ID} for name '${ACCESSORY_NAME}'"
  else
    echo "No ACCESSORY_ID or ACCESSORY_NAME resolved. Please set one." && exit 1
  fi
fi

echo "Running advanced light E2E script against $HB_URL (accessory $ACCESSORY_ID)"

curl_common() {
  local method="$1" path="$2" data="$3"
  if [[ "$method" == "GET" ]]; then
    curl -sS -H "Authorization: Bearer ${HB_TOKEN}" "${HB_URL}${path}"
  else
    curl -sS -X "$method" -H "Authorization: Bearer ${HB_TOKEN}" -H "Content-Type: application/json" -d "$data" "${HB_URL}${path}"
  fi
}

echo "1) Fetch accessories listing"
curl_common GET "/api/accessories" ""

echo
echo "2) Toggle On"
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":11,"value":true}] }'
sleep 1

echo
echo "3) Brightness sweep: 10% -> 50% -> 100%"
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":12,"value":10}] }'
sleep 1
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":12,"value":50}] }'
sleep 1
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":12,"value":100}] }'
sleep 1

echo
echo "4) Color Temperature test (if supported): 2700K -> 4000K -> 6500K"
# HomeKit uses Mireds for color temperature; approximate conversions used here
MIREDS_2700=370
MIREDS_4000=250
MIREDS_6500=154
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" "{ \"characteristics\": [{\"aid\":1,\"iid\":14,\"value\":${MIREDS_2700}}] }"
sleep 1
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" "{ \"characteristics\": [{\"aid\":1,\"iid\":14,\"value\":${MIREDS_4000}}] }"
sleep 1
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" "{ \"characteristics\": [{\"aid\":1,\"iid\":14,\"value\":${MIREDS_6500}}] }"
sleep 1

echo
echo "5) Color (RGB) test (if supported): Red -> Green -> Blue"
# Many HomeKit bridges expose Hue (iid 15) and Saturation (iid 16). We'll set hue and sat values accordingly.
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":15,"value":0},{"aid":1,"iid":16,"value":100}] }'
sleep 1
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":15,"value":120},{"aid":1,"iid":16,"value":100}] }'
sleep 1
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":15,"value":240},{"aid":1,"iid":16,"value":100}] }'
sleep 1

echo
echo "6) Toggle Off"
curl_common POST "/api/accessories/${ACCESSORY_ID}/characteristics" '{ "characteristics": [{"aid":1,"iid":11,"value":false}] }'

echo "Done. Review Homebridge logs and physical device behavior."
