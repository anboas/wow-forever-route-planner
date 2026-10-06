# Feature Requests

## [FEAT-20261006-LOOT-ROUTE-WORKBENCH] Source-backed loot and route workbench

**Logged**: 2026-10-06T01:13:00-04:00
**Priority**: high
**Status**: in_progress
**Area**: frontend

### Requested Capability
Add class-fit loot filters and icons, dungeon-to-boss loot grouping, pointer-anchored tooltips, Wowhead deep links, dungeon maps, faction-pruned quest views, a pinnable quest reward tray, wider sleeker layouts, and route optimization with explicit between-dungeon XP requirements.

### User Context
The planner should function as an information-dense dungeon companion rather than a flat catalog, helping one character plan complete quest runs and inspect relevant gear without leaving context.

### Complexity Estimate
complex

### Suggested Implementation
Centralize source URLs and item enrichment in the sync pipeline; add deterministic class compatibility/relevance rules; expose grouped loot and quest tray interactions; add a deterministic optimizer that scores verified faction-valid quest completeness and computes exact XP deficits between stops; verify wide, mobile, pointer, keyboard, and touch paths.

### Metadata
- Frequency: first_time
- Related Features: route planner, loot archive, quest tooltips, data sync

---
