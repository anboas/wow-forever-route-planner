# Errors

## [ERR-20261006-TOOLTIP-HOVER-CLICK-RACE] Hover and click competed for tooltip state

**Logged**: 2026-10-06T00:40:00-04:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
A pointer click opened a tooltip through hover and then immediately closed it through a naive click toggle.

### Error
```
locator.boundingBox: Timeout 30000ms exceeded waiting for locator('.wow-tooltip')
```

### Context
- Desktop hover and touch tap shared one boolean open state.
- Playwright's mobile-width click reproduced the competing event sequence.

### Suggested Fix
Track transient hover/focus visibility separately from a click/tap-pinned state.

### Metadata
- Reproducible: yes
- Related Files: src/App.jsx, scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-06T00:42:00-04:00
- **Notes**: Added an explicit pinned state; hover remains transient, click/tap pins, and a second click or Escape closes.

---

## [ERR-20261006-MIXED-LOOT-EFFECT-SHAPE] Loot effects use mixed array and object shapes

**Logged**: 2026-10-06T00:31:00-04:00
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary
The checked-in loot snapshot contains both array-valued and object-valued `effects`, so consumers cannot assume every effect collection is directly iterable.

### Error
```
TypeError: object is not iterable
```

### Context
- A schema inventory probe iterated every dungeon loot entry.
- Most detailed Forever records use arrays, while some imported legacy catalog records use object maps.

### Suggested Fix
Normalize effect values at the rendering boundary and cover both shapes in the UI verifier.

### Metadata
- Reproducible: yes
- Related Files: src/App.jsx, scripts/verify-site.mjs, src/data/wow-forever.json

### Resolution
- **Resolved**: 2026-10-06T00:44:00-04:00
- **Notes**: Added a rendering-boundary normalizer for array, object-map, and scalar effects plus browser coverage for the legacy object-map shape.

---

## [ERR-20261006-PLAYWRIGHT-LABEL-SUBSTRING] Exact input selector required

**Logged**: 2026-10-06T00:32:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
Playwright's substring label matching resolved the `Level` input plus XP progress bars whose accessible names also contained “level”.

### Error
```
getByLabel('Level') resolved to 4 elements
```

### Context
- The application rendered correctly.
- The UI verifier used a broad accessible-label selector.

### Suggested Fix
Use `getByRole("spinbutton", { name: "Level", exact: true })` for the numeric level control.

### Metadata
- Reproducible: yes
- Related Files: scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-06T00:33:00-04:00
- **Notes**: Replaced broad label matching with exact role/name selectors for both numeric inputs.

---

## [ERR-20261006-MISSING-PROD-SMOKE-ALIAS] Release command missing from package scripts

**Logged**: 2026-10-06T00:26:00-04:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
The production smoke implementation and README command existed, but `package.json` omitted the `verify:prod-smoke` alias.

### Error
```
npm error Missing script: "verify:prod-smoke"
```

### Context
- The deployment itself had completed successfully.
- `scripts/prod-smoke.mjs` was already committed and used by the container check.

### Suggested Fix
Keep every documented release command represented in `package.json` and exercise it before deployment.

### Metadata
- Reproducible: yes
- Related Files: package.json, README.md, scripts/prod-smoke.mjs

### Resolution
- **Resolved**: 2026-10-06T00:27:00-04:00
- **Notes**: Added the missing npm script and reran it against the canonical Pages URL.

---

## [ERR-20261006-WRANGLER-PAGES-DELEGATION] Pages command delegated to Workers

**Logged**: 2026-10-06T00:25:00-04:00
**Priority**: medium
**Status**: resolved
**Area**: infra

### Summary
Wrangler 4.147 delegated `wrangler pages deploy` to the Workers deployment path and rejected the static Pages build for lacking a Worker entry point.

### Error
```
Missing entry-point to Worker script or to assets directory
```

### Context
- The build completed successfully.
- Wrangler explicitly reported that nothing was deployed.
- Its compatibility guidance requires `wrangler pages deploy --force` for the previous direct Pages path.

### Suggested Fix
Keep `--force` on the repository's Pages deployment command until the project is deliberately migrated to Workers Assets.

### Metadata
- Reproducible: yes
- Related Files: package.json, wrangler.toml

### Resolution
- **Resolved**: 2026-10-06T00:26:00-04:00
- **Notes**: A new Pages project requires one explicit `wrangler pages project create <name> --production-branch main --force` call to bypass Workers delegation. Once the project exists, remove `--force`; subsequent `wrangler pages deploy` calls route directly to Pages.

---

## [ERR-20261006-OPENCLAW-BROWSER-ATTACH] Managed browser could not start

**Logged**: 2026-10-06T00:36:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The OpenClaw browser profile was configured `attachOnly` and no browser was running.

### Error
```
Browser attachOnly is enabled and profile "openclaw" is not running.
```

### Context
- The repository's Playwright verifier had already launched the installed Chromium successfully.
- This only blocked an additional screenshot through the managed-browser transport.

### Suggested Fix
Use the repository-owned Playwright path on this host unless an OpenClaw browser profile is already attached.

### Metadata
- Reproducible: yes
- Related Files: scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-06T00:36:00-04:00
- **Notes**: Continued with the verified Playwright Chromium path.

---
