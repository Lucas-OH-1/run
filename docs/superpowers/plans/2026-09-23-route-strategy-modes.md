# 탄천 중심 경로 전략 모드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 탄천자전거도로를 반드시 경유하는 경로와 자동차 없는 길, 최단거리, 균형형 경로를 함께 제공한다.

**Architecture:** 기존 Photon/ArcGIS 지오코딩과 BRouter를 유지한다. Overpass에서 탄천으로 명명된 자전거도로/자전거 route geometry를 조회하고, 출발·도착점과 가장 가까운 corridor 점 및 중간 점을 BRouter의 다중 `lonlats` 경유점으로 전달한다. 일반 3개 모드는 각기 다른 BRouter 프로필을 사용하고, 앱은 `RIVER`, `SAFE`, `SHORT`, `MIXED` 네 모드를 카드와 지도 레이어에 표시한다.

**Tech Stack:** JavaScript ES modules, Vitest, BRouter custom profiles, Overpass API, Leaflet, Vite

---

## 모드 정의

- `RIVER`: 탄천 corridor 진입점·중간점·이탈점을 경유하는 필수 탄천 경로. corridor를 조회할 수 없으면 경로를 성공으로 표시하지 않고 사용자에게 탄천 경로를 찾지 못했다고 안내한다.
- `SAFE`: `footway`, `pedestrian`, `path`, `track`, 보행 가능한 `cycleway`를 우선하고 일반도로·큰길을 강하게 회피한다.
- `SHORT`: 보행 가능한 최단거리.
- `MIXED`: 탄천·보행로 선호와 거리·연결성을 절충한다.

카드 제목은 각각 `탄천자전거도로 필수`, `자동차 없는 길`, `최단거리`, `반반 혼합`으로 표시한다.

## 파일 구조

- Create `src/config.js` constants: `OVERPASS_URL`, `ROUTE_MODES`, four route colors.
- Create `src/services/corridor.js`: Overpass query, geometry normalization, nearest corridor points, waypoint selection.
- Modify `src/routing/profiles.js`: `RIVER`, `SAFE`, `SHORT`, `MIXED` profiles and shared foot-access rules.
- Modify `src/services/routing.js`: mode-based profile cache and optional `viaPoints`; RIVER request uses ordered multi-point `lonlats`.
- Modify `src/map/create-map.js`: route colors for four modes; retain selected-route styling.
- Modify `src/routing/analyze-route.js`: preserve existing statistics and expose optional corridor distance when route messages provide it.
- Modify `src/app.js`: four card labels/descriptions, normalized mode names, RIVER corridor lookup/error state, route selection.
- Modify `src/main.js`: provide corridor service to the app.
- Modify `index.html` and `src/styles.css`: update card/help copy for four strategies.
- Modify tests in `tests/profiles.test.js`, `tests/routing.test.js`, `tests/map-style.test.js`, `tests/app-flow.test.js`; create `tests/corridor.test.js`.

### Task 1: Corridor service

- [ ] Write failing tests for Overpass geometry normalization and nearest-point selection.
- [ ] Use Overpass query with the selected start point as the center:

```text
const query = `[out:json][timeout:20];
(
  way["highway"="cycleway"]["name"~"탄천"](around:10000,${start.lat},${start.lng});
  way["route"="bicycle"]["name"~"탄천"](around:10000,${start.lat},${start.lng});
  way["highway"="cycleway"]["route_bicycle_lcn"](around:10000,${start.lat},${start.lng});
);
out geom;`;
```

- [ ] Normalize returned `elements[].nodes` and `elements[].geometry` into node IDs and coordinates, remove invalid ways, and mark nodes belonging to ways whose `tags.name` contains `탄천`.
- [ ] Build an undirected graph from consecutive OSM node pairs, find connected components containing Tancheon nodes, and run Dijkstra over one component. Select an exit node near the destination with a maximum 3km access distance so the corridor does not terminate prematurely or loop through an unrelated branch.
- [ ] Sample the resulting continuous graph path at no more than 1.5km spacing. Reject the corridor when no connected path exists or when the entry distance exceeds 5km.
- [ ] Convert Overpass/network/empty results to `탄천자전거도로를 찾지 못했습니다. 지도에서 직접 지점을 선택해주세요.`.
- [ ] Test exact query parameters through injected `fetchImpl` and verify nearest/ordered waypoints.

### Task 2: Progress reporting

- [ ] Add an accessible progress element with a numeric value and Korean stage label.
- [ ] Report 5% before corridor lookup, 25% after corridor selection, 30% before BRouter requests, and 25–95% as each of the four routes completes. Show 100% after cards render and retain an error state with retry when a service fails.
- [ ] Clear progress on point changes, retry, destroy, and successful completion after a short visible 100% state.

### Task 3: Profiles and routing client

- [ ] Write failing tests for `RIVER`, `SAFE`, `SHORT`, `MIXED` mode order, profile caching, and multi-waypoint URL encoding.
- [ ] Define profile costs:
  - `RIVER`: footway/pedestrian/path 1, cycleway 1.4, track 1.6, steps 10000, residential/service 10, tertiary 25, secondary 50, primary/trunk 100.
  - `SAFE`: footway/pedestrian/path/track 1, cycleway 1.3, steps 10000, residential/service 12, tertiary 30, secondary 60, primary/trunk 120.
  - `SHORT`: all foot-accessible ways 1 and motorways/proposed/abandoned/construction 100000.
  - `MIXED`: footway/pedestrian/path 1, cycleway 1.2, track 1.4, steps 3, residential/service 5, tertiary 12, secondary 25, primary/trunk 50.
- [ ] Keep `assign accesspenalty switch footaccess 0 100000` in every profile and reject motor-road/private/no-foot access.
- [ ] Change `getRoutes(start, end, { corridor })` to return modes in `['RIVER','SAFE','SHORT','MIXED']` order. For RIVER, create `lonlats` from `[start, ...corridor.waypoints, end]`; other modes use start/end only.
- [ ] Preserve profile ID caching, concurrent registration deduplication, HTTP re-registration retry, malformed GeoJSON validation, and friendly errors.
- [ ] Add tests that assert RIVER includes every ordered corridor waypoint and other modes do not.

### Task 4: Map and analysis contract

- [ ] Write failing tests for all four route colors and selected/unselected style behavior.
- [ ] Add four stable colors and use mode keys rather than A/B/C. Default selected mode is `RIVER`.
- [ ] Retain marker cleanup and GeoJSON validation. `setRoutes` must accept only normalized four-mode route objects.
- [ ] Keep distance, pedestrian percentage, road, steps, shared-cycleway, and structure statistics. Set `showPedestrianSideHint` when shared-cycleway distance is positive.

### Task 5: App integration and UI

- [ ] Write failing integration tests for four cards, RIVER corridor lookup before routing, failed corridor state, card selection, and stale async response protection.
- [ ] Update `createApp` dependencies to `{ corridor, routing, geocoding }` while preserving optional dependency behavior in unit tests.
- [ ] On submit, obtain the RIVER corridor first, then call `routing.getRoutes(start, end, { corridor })`. If corridor lookup fails, show its message, do not call routing, and expose retry.
- [ ] Render these descriptions without `innerHTML`:
  - RIVER: `탄천자전거도로 필수`
  - SAFE: `자동차 없는 길`
  - SHORT: `최단거리`
  - MIXED: `반반 혼합`
- [ ] Keep loading disable, retry, offline handling, address selection, map selection, stale request guards, and map cleanup.
- [ ] Add a route legend/help text explaining that RIVER may detour to reach the corridor and other modes do not guarantee river access.

### Task 6: Verification and deployment

- [ ] Run focused corridor/profile/routing tests and confirm failures occur before implementation.
- [ ] Run `npm ci && npm test && npm run build`.
- [ ] Run an Overpass smoke query around the current route and verify at least one RIVER corridor with ordered waypoints.
- [ ] Run BRouter with the current `태평동 7184-9` and `위례서로 273` coordinates and verify the RIVER request contains corridor waypoints and returns a route.
- [ ] Verify four cards, RIVER selected by default, SAFE/SHORT/MIXED selection, retry/error state, and marker display in the deployed page.
- [ ] Update README with the four modes, RIVER detour behavior, Overpass dependency, and safety limitation.
- [ ] Commit each task with Conventional Commit messages and redeploy GitHub Pages after final verification.
