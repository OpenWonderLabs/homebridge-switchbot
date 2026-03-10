# E2E scripts

This folder contains small helper scripts used by the vitest E2E harness `test/e2e/run-e2e.spec.ts`.

Usage

- Export `HB_URL` and `HB_TOKEN` for Homebridge UI access. Optionally set `ACCESSORY_ID` or accessory-specific env vars like `LIGHT_ACCESSORY_ID`.
- Run a single script:

```bash
export HB_URL="http://localhost:8581"
export HB_TOKEN="<token>"
export ACCESSORY_ID="<aid_or_uuid_or_context.deviceId>"
bash light-e2e.sh
```

- Or run the harness via vitest:

```bash
RUN_E2E=1 npx vitest run test/e2e/run-e2e.spec.ts
```

Security

- Keep the `HB_TOKEN` value secret. Use CI secret storage when running in automation.
