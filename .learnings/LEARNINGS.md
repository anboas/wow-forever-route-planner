# Learnings

## [LRN-20261006-DENSE-REFERENCE-USE] correction

**Logged**: 2026-10-06T21:36:00-04:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
When Adam references another product, borrow its useful information architecture before borrowing its visual identity.

### Details
The WOWF.IO audit correctly identified useful metadata, encounter filtering, and loot facts, but the first implementation also copied its large image-backed hero, serif hierarchy, warm palette, and tabbed presentation. That turned a data-dense planner into a decorative destination page and hid related information behind tabs.

### Suggested Action
Keep the existing flat dashboard design language. Present map, quests, encounter sources, and loot together in a compact desktop workspace; use reference sites to improve information coverage and navigation, not visual branding, unless the user explicitly requests a style match.

### Metadata
- Source: user_feedback
- Related Files: src/App.jsx, src/styles.css
- Tags: reference-design, density, information-architecture, dashboard

### Resolution
- **Resolved**: 2026-10-06T21:36:00-04:00
- **Notes**: Replaced the decorative hero/tabs with a compact header, one-line metrics, side-by-side map and quest ledger, and persistent loot workbench.

---

## [LRN-20261006-FILTER-PROXIMITY] correction

**Logged**: 2026-10-06T22:32:00-04:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Do not move a primary filter away from the results it controls merely to fill otherwise unused layout space.

### Details
The map-canvas correction moved the boss loot filter into the map/quest sidebar. This filled the sidebar, but on dungeons with few bosses the controls stretched into oversized rows, and the filter was visually disconnected from the loot table below. The layout improved its space-usage metric while making the actual loot-filtering workflow harder.

### Suggested Action
Keep a compact, horizontal boss filter immediately above dungeon loot results. Use the map sidebar only for contextual quest and encounter information. Regression tests should assert filter/result proximity, compact control height, visible counts, and boss-filter behavior at ultrawide and mobile sizes.

### Metadata
- Source: user_feedback
- Related Files: src/App.jsx, src/styles.css, scripts/verify-site.mjs
- Tags: filters, proximity, loot, density, workflow
- See Also: LRN-20261006-MAP-CANVAS-UTILITY

### Resolution
- **Resolved**: 2026-10-06T22:39:00-04:00
- **Notes**: Replaced the stretched sidebar control with a 47px horizontal boss strip directly above loot controls/results, kept the sidebar encounter list read-only and compact, and added browser assertions for proximity, height, counts, filtering, and mobile overflow.

---

## [LRN-20261006-MAP-CANVAS-UTILITY] correction

**Logged**: 2026-10-06T22:08:00-04:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
A map source is not usable merely because it is official; dungeon-map views must prioritize navigable interior information and measured canvas utilization.

### Details
The wide-screen release promoted a stitched official client minimap mosaic for Ruins of Lordaeron to a selectable dungeon floor. The asset is authentic terrain context but is not an interior dungeon map, so it appeared broken. The map panel also reserved a 210–250px metadata/encounter column inside the primary canvas and stretched that column to map height, producing large empty black regions. The title/actions/summary occupied a separate full-width band even though their information could fit in a compact toolbar.

### Suggested Action
Exclude `client-overhead` assets from navigable floor controls when a sourced route schematic or interior floor exists. Put provenance and encounter metadata in a compact caption or overlay, not a height-matched side column. Measure usable map pixels and dead area at 1440px and 2560px, and reject releases where the primary map canvas contains large non-map regions.

### Metadata
- Source: user_feedback
- Related Files: src/App.jsx, src/styles.css, src/data/dungeon-maps.json, scripts/verify-site.mjs
- Tags: map, density, wide-screen, source-semantics, regression
- See Also: LRN-20261006-DENSE-REFERENCE-USE

### Resolution
- **Resolved**: 2026-10-06T22:28:00-04:00
- **Notes**: Removed exterior terrain mosaics from navigable dungeon floors, replaced the full-height metadata rail with a 42px caption, compressed title/metrics/actions into one 64px command bar, and kept a compact read-only encounter index beside the quest ledger. Browser gates now measure command-bar height, caption height, full-width map occupancy, and the Ruins route-map default.

---

## [LRN-20261006-PLAYWRIGHT-CORE] error

**Logged**: 2026-10-06T22:38:00-04:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
Use the repository's installed `playwright-core` package for ad hoc visual probes, not `playwright`.

### Details
The project browser gate imports `playwright-core`, but an ad hoc screenshot command imported `playwright` and failed before launching Chromium because that package is not installed.

### Suggested Action
Mirror `scripts/verify-site.mjs`: import `playwright-core`, discover `/usr/bin/chromium-browser`, and pass `--no-sandbox` for local visual review.

### Metadata
- Source: tool_error
- Related Files: scripts/verify-site.mjs, scripts/capture-screenshots.mjs
- Tags: playwright, visual-review, tooling

### Resolution
- **Resolved**: 2026-10-06T22:38:00-04:00
- **Notes**: Re-ran the 1920px visual proof with `playwright-core`; the boss strip measured 47px high, exposed all boss choices and counts, and produced zero horizontal overflow.

---
