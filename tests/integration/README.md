Playwright-backed extension integration checks.

Run:

```bash
npm run build
npm run test:integration
```

Validates:

- popup settings save/reload (policy mode + allowlist)
- popup intelligence snapshot + drift rendering
- local-only guard blocks background `fetch`
- vault entries are encrypted at rest
- quarantine decay results in timed smash
