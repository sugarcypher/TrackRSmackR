Playwright-backed extension integration checks.

Run:

```bash
npm run build
npm run test:integration
```

Validates:

- popup settings save/reload (policy mode + allowlist)
- uniform persona toggle persistence
- popup intelligence snapshot + drift/deception rendering (engine summary or fallback)
- local-only guard blocks background `fetch`
- vault entries are encrypted at rest
- quarantine decay results in timed smash
