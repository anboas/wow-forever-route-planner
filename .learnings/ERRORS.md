# Errors

## [ERR-20261006-BLP-WASM-NODE-INIT] BLP decoder default WASM initializer failed in Node

**Logged**: 2026-10-06T01:18:00-04:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
`wow-blp-web` default initialization attempted to fetch its local WASM file through Node fetch, which does not support that file-URL path.

### Error
```
TypeError: fetch failed
cause: Error: not implemented... yet...
```

### Context
- The map sync needs to convert AtlasLootClassic BLP assets into browser-readable PNGs.
- The package includes the required WASM binary locally.

### Suggested Fix
Read the bundled WASM bytes with `node:fs/promises` and pass them as `module_or_path` to the initializer.

### Metadata
- Reproducible: yes
- Related Files: scripts/sync-maps.mjs, package.json

### Resolution
- **Resolved**: 2026-10-06T01:19:00-04:00
- **Notes**: Explicit WASM-byte initialization successfully converted RagefireChasm.blp into a valid PNG payload.

---
## [ERR-20261007-RUN-REWRITE] pages_redirect_target

**Logged**: 2026-10-07T19:19:00Z
**Priority**: high
**Status**: resolved
**Area**: deployment

### Summary
Cloudflare Pages uploaded the run redirect rule but returned 404 for nested run URLs when the rewrite target named `index.html` directly.

### Error
```
GET /runs/public-proof-id/ -> 404
```

### Context
- `/runs/index.html` existed and deployment uploaded `_redirects`.
- The permanent run route required the directory target for Pages index resolution.

### Suggested Fix
Rewrite `/runs/*` to `/runs/` with status 200, preserving the original URL while allowing Pages to resolve the directory index.

### Metadata
- Reproducible: yes
- Related Files: scripts/build-pages.mjs

### Resolution
- **Resolved**: 2026-10-07T19:20:00Z
- **Notes**: The build now emits `/runs/* /runs/ 200` and production proof checks the nested route directly.

---
## [ERR-20261007-PARTIAL-STATE] shallow_state_hydration

**Logged**: 2026-10-07T18:48:00Z
**Priority**: high
**Status**: resolved
**Area**: character state

### Summary
A valid partial character state replaced nested defaults during hydration, leaving optional arrays undefined and crashing the My Gear page after a direct load.

### Error
```
Cannot read properties of undefined (reading 'length')
```

### Context
- Authentication, persistence, and the party API succeeded.
- Direct-loading the saved character exposed the shallow merge in `normalizedState`.

### Suggested Fix
Normalize nested character metadata, telemetry, loot preferences, lists, and dictionaries at the persistence boundary.

### Metadata
- Reproducible: yes
- Related Files: src/App.jsx, scripts/verify-auth.mjs

### Resolution
- **Resolved**: 2026-10-07T18:49:00Z
- **Notes**: Partial, legacy, addon, and future Armory state now merge with complete nested defaults before rendering.

---
## [ERR-20261007-FIRST-CHARACTER] provisioning_race

**Logged**: 2026-10-07T18:39:00Z
**Priority**: medium
**Status**: resolved
**Area**: authentication

### Summary
The authenticated application shell could render before automatic first-character provisioning completed, allowing the account dialog to open and then disappear when the character switch remounted the app.

### Error
```
Account & characters dialog disappeared during first-login provisioning.
```

### Context
- The account and character were created correctly.
- The defect was a transient first-login interaction race.

### Suggested Fix
Hold the secure workspace on an explicit provisioning state until the first character has been created or migrated.

### Metadata
- Reproducible: timing-dependent
- Related Files: src/AuthContext.jsx, scripts/verify-auth.mjs

### Resolution
- **Resolved**: 2026-10-07T18:40:00Z
- **Notes**: The provider now shows a deterministic character-provisioning state before mounting the application shell.

---
## [ERR-20261007-RUN-EVENT] browser_contract_label

**Logged**: 2026-10-07T18:32:00Z
**Priority**: low
**Status**: resolved
**Area**: verification

### Summary
The new run-detail contract expected a space-normalized event label, while the UI intentionally preserves the telemetry event key with a hyphen.

### Error
```
Expected: Boss engaged
Rendered: BOSS-ENGAGED
```

### Context
- XP/hour, boss progress, timeline data, and loot all rendered correctly.
- Only the verifier's label spelling was stale.

### Suggested Fix
Assert the stable telemetry label rendered by the product instead of inventing a different normalization.

### Metadata
- Reproducible: yes
- Related Files: scripts/verify-site.mjs, src/App.jsx

### Resolution
- **Resolved**: 2026-10-07T18:33:00Z
- **Notes**: The browser contract now checks `Boss-engaged`, matching the actual semantic event label.

---

## [ERR-20261007-MOBILE-NAV-WISHLIST-OVERFLOW] Wishlist count widened the compact primary navigation

**Logged**: 2026-10-07T10:30:32-04:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
The addon-language navigation passed on a clean 390px profile but overflowed after the browser contract added one wishlist item.

### Error
```
mobile dungeon detail overflow: 408px > 390px
```

### Context
- The primary navigation contains five equal-width links at mobile widths.
- The `My Gear` wishlist badge participated in the link's intrinsic width after stateful browser interactions.
- A clean screenshot without wishlist state did not reproduce the contract failure.

### Suggested Fix
Keep state badges out of mobile flex sizing and make browser overflow failures report measured widths and offending elements.

### Metadata
- Reproducible: yes
- Related Files: src/styles.css, scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-07T10:30:32-04:00
- **Notes**: Positioned the mobile wishlist badge absolutely, removed its layout width, and upgraded the regression assertion with page-width and offender diagnostics. Rebuilt production assets before rerunning the browser gate.

---

## [ERR-20261007-WIREFRAME-PLAYWRIGHT] Project-local Playwright assumption blocked PNG export

**Logged**: 2026-10-07T09:04:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
The first wireframe PNG render attempted to require Playwright from the app repository, but the project does not install Playwright locally.

### Error
```
Error: Cannot find module 'playwright'
```

### Context
- The source artifact was already a standalone inline-SVG HTML document.
- The host provides Chromium at `/snap/bin/chromium`, so a browser library was unnecessary.

### Suggested Fix
For standalone HTML/SVG exports, discover and use the host Chromium CLI before assuming a project-local browser dependency.

### Metadata
- Reproducible: yes
- Related Files: design/addon-ui-wireframe.html

### Resolution
- **Resolved**: 2026-10-07T09:05:00-04:00
- **Notes**: Switched the export to the host Chromium headless screenshot path.

---

## [ERR-20261007-STYLE-RESEARCH-FALLBACK] Perplexity styling research lacked a configured protected key

**Logged**: 2026-10-07T08:39:00-04:00
**Priority**: low
**Status**: resolved
**Area**: research

### Summary
The current-addon style review could not use Perplexity because no API key is configured.

### Resolution
Used direct public maintainer pages for BetterBags and AdiBags instead. The implemented design follows the evidenced patterns that matter here: clean section grids, task tabs, intelligent defaults, compact discoverable controls, and a small persistent launcher/HUD.

---

## [ERR-20261007-CHROMIUM-PATH] Visual probe assumed the wrong Chromium executable path

**Logged**: 2026-10-07T08:39:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The one-off screenshot probe used `/usr/bin/chromium`; this host exposes Chromium at `/usr/bin/chromium-browser`.

### Resolution
Reran the same visual proof with the discovered executable. Desktop and 390px captures completed successfully.

---

## [ERR-20261007-ADDON-DOWNLOAD-SELECTOR] Browser gate used a singular selector after adding a prominent download CTA

**Logged**: 2026-10-07T08:35:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The intelligence page intentionally contains primary and integration-panel addon downloads, but the legacy browser assertion selected the shared class in strict mode.

### Error
```
strict mode violation: locator('.addon-download') resolved to 2 elements
```

### Resolution
Scoped the package-link assertion to `.addon-download-primary`; interaction coverage still verifies the surrounding companion panel independently.

The subsequent metric assertion was also made case-insensitive and whitespace-tolerant because browser `innerText` preserves the CSS-transformed block layout between numeric values and labels.

---

## [ERR-20261007-COMPANION-ASSERTION-PROTOCOL] Companion verifier expected only the legacy WFRP1 error text

**Logged**: 2026-10-07T08:25:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The expanded parser correctly accepts WFRP2 telemetry and broadened its invalid-input message, while the verifier still required the former WFRP1-only wording.

### Error
```
AssertionError: expected /Expected a WFRP1/
```

### Resolution
- Updated the assertion to the protocol-neutral message.
- Added an end-to-end WFRP2 payload, telemetry summary, generated-data, UI-view, and event-recorder checks so the new contract is covered directly.

---

## [ERR-20261006-GH-CODE-SEARCH-METHOD] GitHub code search used the write request method

**Logged**: 2026-10-06T20:00:00-04:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
`gh api search/code` returned 404 because `-f` switched the request to POST instead of sending a GET query.

### Error
```
HTTP 404: Not Found
```

### Context
- The probe was looking for public map assets for Forever-original dungeons.
- GitHub's code-search endpoint accepts a GET request with query parameters.

### Suggested Fix
Use `gh api --method GET search/code -f q=...`, or `gh search code`, for repository-wide public code searches.

### Metadata
- Reproducible: yes
- Related Files: none

### Resolution
- **Resolved**: 2026-10-06T20:00:00-04:00
- **Notes**: Corrected the request method before continuing source discovery.

---

## [ERR-20261006-FOREVER-MAP-SOURCE-LIMITS] Map research sources blocked or exhausted auxiliary probes

**Logged**: 2026-10-06T20:05:00-04:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Icy Veins returned a bot-protection 403, GitHub code search reached its API quota, and the native image viewer could not render generated SVG files directly.

### Error
```
Icy Veins: HTTP 403
GitHub search: API rate limit exceeded
view_image: invalid or unsupported image data
```

### Context
- These were auxiliary discovery and visual-review paths for Forever dungeon maps.
- WOWF.IO, Wago Tools, raw GitHub files, and repository Playwright remained available.

### Suggested Fix
Use checked raw source URLs for deterministic adapters, browser-render SVGs before visual inspection, and reserve GitHub code search for bounded discovery.

### Metadata
- Reproducible: yes
- Related Files: scripts/sync-maps.mjs

### Resolution
- **Resolved**: 2026-10-06T20:05:00-04:00
- **Notes**: Built original SVG route schematics from NaowhForever's raw coordinate data and reviewed them through the app's Playwright render path.

---

## [ERR-20261006-PUBLIC-MAP-PROBE-CASE] Public map probe assumed visual text casing

**Logged**: 2026-10-06T20:12:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The one-off public probe expected title casing even though CSS exposes the map label as uppercase accessibility text.

### Error
```
AssertionError: /Sourced route schematic/ did not match "SOURCED ROUTE SCHEMATIC"
```

### Context
- Production loaded the correct release and map content.
- The repository browser gate already used a case-insensitive assertion.

### Suggested Fix
Use case-insensitive matching for visually transformed labels in public diagnostics.

### Metadata
- Reproducible: yes
- Related Files: scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-06T20:12:00-04:00
- **Notes**: Reran the bounded public probe with case-insensitive matching; Hall of Thanes, Dalaran floor switching, and mobile containment passed.

---

## [ERR-20261006-PUBLIC-NETWORKIDLE] Public browser proof waited indefinitely for network idle

**Logged**: 2026-10-06T18:20:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The public Cloudflare interaction probe stalled on `networkidle` because external item and class icon traffic can keep the page network active.

### Error
```
Public browser probe produced no output while waiting for networkidle.
```

### Context
- The canonical production smoke had already passed.
- The application renders synchronously from its checked-in snapshot, while optional external icon requests continue independently.

### Suggested Fix
For public static-host proofs, navigate with `domcontentloaded` and wait for the first owned application surface instead of waiting for all third-party image traffic to quiesce.

### Metadata
- Reproducible: yes
- Related Files: scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-06T18:20:00-04:00
- **Notes**: The final public proof uses `domcontentloaded` followed by an explicit `.route-step` readiness assertion.

---

## [ERR-20261006-WARCRAFT-WIKI-MAP-FETCH] Warcraft Wiki blocked automated map retrieval

**Logged**: 2026-10-06T01:15:00-04:00
**Priority**: low
**Status**: pending
**Area**: frontend

### Summary
The Warcraft Wiki page returned an anti-bot interstitial instead of readable dungeon map content.

### Error
```
Web fetch failed (403): Just a second...
```

### Context
- The requested dungeon-map feature needs source-backed imagery.
- Existing WOWF.IO and wowtbc.gg data remain available.

### Suggested Fix
Use publicly exposed source metadata or checked-in licensed assets; label unavailable maps instead of inventing dungeon layouts.

### Metadata
- Reproducible: yes
- Related Files: scripts/sync-data.mjs, src/App.jsx

---

## [ERR-20261006-CLOUDFLARE-PROXY-FETCH] Protected Wrangler deploy hit gateway proxy fetch failure

**Logged**: 2026-10-06T00:38:00-04:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Wrangler received the protected Secret Store context through the gateway but its Cloudflare API fetch failed at the proxy layer before upload.

### Error
```
A fetch request failed, likely due to a connectivity issue.
ERROR fetch failed
```

### Context
- The production build completed successfully in the gateway execution.
- The credential remained protected and was not printed or copied into the command.
- Cloudflare production was unchanged.

### Suggested Fix
Retry once for a transient gateway proxy failure; if it persists, repair protected egress instead of falling back to plaintext credentials.

### Metadata
- Reproducible: unknown
- Related Files: package.json, wrangler.toml

---

## [ERR-20261006-CLOUDFLARE-TOKEN-CONTEXT] Wrangler lost protected credential context

**Logged**: 2026-10-06T00:37:00-04:00
**Priority**: medium
**Status**: resolved
**Area**: infra

### Summary
The repository deployment command ran in a fresh non-interactive shell without the existing protected Cloudflare credential context.

### Error
```
In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work.
```

### Context
- Build completed successfully.
- Wrangler stopped before uploading, so production was unchanged.
- The token must remain in the protected Secret Store and must not be copied into commands, logs, or repository files.

### Suggested Fix
Resolve the existing Cloudflare SecretRef and perform the deploy through a gateway command with protected injection.

### Metadata
- Reproducible: yes
- Related Files: package.json, wrangler.toml

### Resolution
- **Resolved**: 2026-10-06T00:38:00-04:00
- **Notes**: Located the existing Secret Store entry and routed deployment through gateway-protected injection. A separate proxy connectivity issue remains tracked independently.

---

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
# Browser verifier matched superseded optimizer copy

**Date:** 2026-10-06
**Status:** Resolved

## Error

The expanded UI browser gate expected the optimizer notice to contain `bridge XP`, but the shipped UI deliberately labels that quantity `planned external XP`.

## Cause

The test assertion was written against an earlier internal label after the user-facing copy had been clarified.

## Fix

Assert the final user-facing `external XP` term. Keep tests aligned to intentional product copy while preserving separate numeric planner tests for bridge-XP calculation.

## Follow-up

A whole-row `hasText: "Alliance"` assertion also matched legitimate quest/dungeon names containing the word. The faction exclusion check now targets the dedicated faction metadata cell, avoiding false positives from content names.

The tooltip heading is visually transformed to uppercase by CSS, so its accessibility-text assertion is intentionally case-insensitive.

Escape was handled simultaneously by a nested reward tooltip and its pinned quest tray, closing both layers at once. The tray now detects an open tooltip and leaves the first Escape to that inner layer; a second Escape closes the tray. The browser test covers the two-stage dismissal.

Chromium can clear a focused `type=search` field when Escape dismisses an overlapping tooltip, expanding the dynamic `.loot-row` locator back to all rows. The activation assertion now keeps an item-name filter in the locator so it targets the intended record even if native search-field behavior clears the query.

---

## [ERR-20261006-ROUTE-COLLAPSE-CONTRACT] Browser verifier assumed expanded route stops

**Logged**: 2026-10-06T18:00:00-04:00
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The browser verifier timed out focusing a route quest after route stops intentionally changed to collapsed-by-default.

### Error
```
locator.focus: Timeout 30000ms exceeded waiting for .quest-row-trigger
```

### Context
- The UI correctly omitted quest rows until a stop was expanded.
- The old test encoded the superseded always-expanded interaction contract.

### Suggested Fix
Assert the compact collapsed state first, activate the named expand control, then exercise quest focus and tooltip behavior.

### Metadata
- Reproducible: yes
- Related Files: src/App.jsx, scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-06T18:00:00-04:00
- **Notes**: Updated the browser gate to verify collapsed-by-default behavior and explicitly expand the first stop before quest interaction. Mobile dock controls include their visible glyphs in accessible names, so scoped role selectors match the action label without requiring an icon-free exact name.

---

## [ERR-20261006-DUNGEON-SNAPSHOT-PATH] Schema probe used a removed snapshot filename

**Logged**: 2026-10-06T21:22:00-04:00
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary
A read-only dungeon schema probe imported `src/data/dungeons.json`, but the app consumes `src/data/wow-forever.json`.

### Error
```
ERR_MODULE_NOT_FOUND: Cannot find module src/data/dungeons.json
```

### Context
- The generated dataset was consolidated into `wow-forever.json` earlier in the project.
- No file or external state changed.

### Suggested Fix
Resolve generated imports from `src/App.jsx` before probing data filenames.

### Metadata
- Reproducible: yes
- Related Files: src/App.jsx, src/data/wow-forever.json

### Resolution
- **Resolved**: 2026-10-06T21:23:00-04:00
- **Notes**: Read the active import from `src/App.jsx` and continued against `wow-forever.json`.

---

## [ERR-20261006-DUNGEON-LOOT-TAB-SELECTOR] Visual probe used an ambiguous Loot button selector

**Logged**: 2026-10-06T21:29:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The WOWF-inspired dungeon subnavigation introduced a second valid Loot button, so a regex role selector matched the global view, dungeon tab, and dungeon cards.

### Error
```
strict mode violation: getByRole('button', { name: /Loot/ }) resolved to 18 elements
```

### Context
- The UI compiled successfully.
- The failure was isolated to a one-off screenshot harness.

### Suggested Fix
Scope subnavigation checks to `.dungeon-section-nav` and use the exact accessible tab name.

### Metadata
- Reproducible: yes
- Related Files: src/App.jsx, scripts/verify-site.mjs

### Resolution
- **Resolved**: 2026-10-06T21:30:00-04:00
- **Notes**: Scoped the visual probe to `.dungeon-section-nav`.

---

## [ERR-20261006-HERO-XP-ASSERTION-CASE] Browser assertion ignored CSS-transformed metadata casing

**Logged**: 2026-10-06T21:32:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The dungeon hero rendered the expected `QUEST XP 5,680`, but the new assertion required title case.

### Error
```
AssertionError: dungeon hero exposes WOWF-style essential metadata
```

### Context
- CSS intentionally transforms metadata labels to uppercase.
- The application content and layout were correct.

### Suggested Fix
Keep accessibility-text assertions case-insensitive when casing is purely presentational.

### Metadata
- Reproducible: yes
- Related Files: scripts/verify-site.mjs, src/styles.css

### Resolution
- **Resolved**: 2026-10-06T21:32:00-04:00
- **Notes**: Updated the semantic assertion with the case-insensitive flag.

---

## [ERR-20261006-MOBILE-DUNGEON-TAB-STATE] Browser check skipped the default dungeon Map tab

**Logged**: 2026-10-06T21:34:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The mobile verifier returned to the Dungeons view and immediately looked for Loot controls even though the selected dungeon correctly reopened on Map.

### Error
```
mobile dungeon detail keeps every class filter reachable: 0 !== 10
```

### Context
- Global-view navigation remounts the dungeon detail.
- The documented default subview is Map.

### Suggested Fix
Activate the labeled Loot tab before testing nested loot interactions.

### Metadata
- Reproducible: yes
- Related Files: scripts/verify-site.mjs, src/App.jsx

### Resolution
- **Resolved**: 2026-10-06T21:34:00-04:00
- **Notes**: The verifier now activates the visible Loot tab before checking class-filter reachability.

---
## [ERR-20261007-CSS] apply_patch

**Logged**: 2026-10-07T18:08:00Z
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary
An account-workspace CSS patch assumed 1100px and 760px breakpoints, while this project uses 1180px and 900px breakpoints.

### Error
```
apply_patch verification failed: Failed to find expected lines in src/styles.css: @media (max-width: 1100px)
```

### Context
- The component changes were already applied; only the stylesheet patch failed.
- The actual responsive blocks were inspected before retrying.

### Suggested Fix
Anchor responsive patches to the stylesheet's real 1180px and 900px media queries.

### Metadata
- Reproducible: yes
- Related Files: src/styles.css

### Resolution
- **Resolved**: 2026-10-07T18:09:00Z
- **Notes**: Rebased the patch on the existing breakpoint structure.

---
## [ERR-20261007-API] auth_api_route_prefix

**Logged**: 2026-10-07T18:15:00Z
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
The shared client request helper prefixed character requests with `/api/auth`, while character routes live at `/api/characters`.

### Error
```
Account route not found.
```

### Context
- Owner setup and session issuance passed.
- The first character POST reached `/api/auth/characters` instead of `/api/characters`.

### Suggested Fix
Route character paths to the API root and keep authentication paths under `/api/auth`.

### Metadata
- Reproducible: yes
- Related Files: src/auth-api.js, functions/api/[[path]].js

### Resolution
- **Resolved**: 2026-10-07T18:16:00Z
- **Notes**: The client now selects the API root by resource family, and the browser contract covers first-character creation.

---
## [ERR-20261007-REG] verify:auth post-registration logout

**Logged**: 2026-10-07T21:15:00-04:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
The auth browser proof expected the login gate after a self-registered user signed out, but the registration mode persisted in the mounted provider.

### Error
```
locator.click: Timeout 30000ms exceeded waiting for
New to Forever Intelligence? Create an account
```

### Context
- Open registration successfully created and signed in a Player.
- Signing out cleared the session but did not reset the local account-gate mode.
- The user landed back on the registration form instead of the safer default sign-in form.

### Suggested Fix
Reset `gateMode` to `login` during logout and keep the browser proof strict.

### Metadata
- Reproducible: yes
- Related Files: src/AuthContext.jsx, scripts/verify-auth.mjs

### Resolution
- **Resolved**: 2026-10-07T21:15:00-04:00
- **Notes**: Logout now resets the account gate to sign-in before refreshing auth state.

---
## [ERR-20261007-ADDON-INTERFACE] Forever companion shipped with the Classic Era interface number

**Logged**: 2026-10-07T21:35:00-04:00
**Priority**: critical
**Status**: resolved
**Area**: config

### Summary
The downloadable addon was marked incompatible because its TOC declared interface 11508 instead of WoW Forever interface 16001.

### Error
```
Forever Route Companion appears as incompatible in the WoW Forever AddOns list.
```

### Context
- The manifest reused a current Classic Era interface value without verifying the custom Forever client interface.
- NaowhForever's current core and module TOCs all declare `## Interface: 16001`.

### Suggested Fix
Target interface 16001, rebuild the public ZIP, and verify both the source and packaged TOCs against the current Forever-native interface value.

### Metadata
- Reproducible: yes
- Related Files: addon/ForeverRouteCompanion/ForeverRouteCompanion.toc, scripts/verify-companion.mjs

### Resolution
- **Resolved**: 2026-10-07T21:40:00-04:00
- **Commit/PR**: included in the Forever Route Companion 1.1.1 compatibility release
- **Notes**: Changed the manifest to interface 16001, rebuilt the ZIP, and added source-plus-package manifest assertions.

---
## [ERR-20261007-ADDON-RANDOMSEED] WoW Forever Lua sandbox omits math.randomseed

**Logged**: 2026-10-07T21:43:00-04:00
**Priority**: critical
**Status**: resolved
**Area**: backend

### Summary
The companion loaded under interface 16001 but failed during PLAYER_LOGIN because `math.randomseed` is nil in WoW Forever.

### Error
```
ForeverRouteCompanion.lua:490: attempt to call a nil value
event="PLAYER_LOGIN"
```

### Context
- The error occurred immediately after fixing the TOC interface mismatch.
- The nil callable was `math.randomseed`; the timestamp argument was valid.
- Run IDs also depended on `math.random`, so the full RNG dependency must be removed.

### Suggested Fix
Use a persisted monotonic run sequence combined with the current timestamp, remove login-time seeding, and block packaged RNG calls in the companion verifier.

### Metadata
- Reproducible: yes
- Related Files: addon/ForeverRouteCompanion/ForeverRouteCompanion.lua, scripts/verify-companion.mjs
- See Also: ERR-20261007-ADDON-INTERFACE

### Resolution
- **Resolved**: 2026-10-07T21:47:00-04:00
- **Commit/PR**: included in the Forever Route Companion 1.1.2 runtime compatibility release
- **Notes**: Removed unavailable RNG APIs, switched run IDs to a persisted monotonic sequence, and added a packaged-code assertion that forbids RNG calls.

---
## [ERR-20261007-ADDON-GETITEMINFO] WoW Forever removes the legacy GetItemInfo global

**Logged**: 2026-10-07T21:50:00-04:00
**Priority**: critical
**Status**: resolved
**Area**: backend

### Summary
Opening the companion dashboard failed while scanning equipped items because the Forever runtime exposes item metadata through `C_Item`, not the legacy global `GetItemInfo`.

### Error
```
ForeverRouteCompanion.lua:127: attempt to call a nil value
itemID=281265
```

### Context
- Inventory item links and IDs were available.
- The nil callable was the unguarded global `GetItemInfo`.
- Current Forever-native NaowhForever code uses `C_Item.GetItemNameByID`, `C_Item.GetItemQualityByID`, and `C_Item.GetDetailedItemLevelInfo`.

### Suggested Fix
Centralize item metadata behind a `C_Item` adapter, tolerate uncached names, and prohibit direct legacy `GetItemInfo` calls in the packaged verifier.

### Metadata
- Reproducible: yes
- Related Files: addon/ForeverRouteCompanion/ForeverRouteCompanion.lua, scripts/verify-companion.mjs
- See Also: ERR-20261007-ADDON-RANDOMSEED, ERR-20261007-ADDON-INTERFACE

### Resolution
- **Resolved**: 2026-10-07T21:57:00-04:00
- **Commit/PR**: included in the Forever Route Companion 1.1.3 item API compatibility release
- **Notes**: Added a centralized `C_Item` metadata adapter with safe uncached-item behavior, prohibited the removed legacy `GetItemInfo` global in the verifier, and hardened adjacent hearth-cooldown and combat-log API calls.

---
