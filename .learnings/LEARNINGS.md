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
