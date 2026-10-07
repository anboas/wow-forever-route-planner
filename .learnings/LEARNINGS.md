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
- **Notes**: Removed exterior terrain mosaics from navigable dungeon floors, replaced the full-height metadata rail with a 42px caption, compressed title/metrics/actions into one 64px command bar, and moved the encounter filter beside the quest ledger. Browser gates now measure command-bar height, caption height, full-width map occupancy, and the Ruins route-map default.

---
