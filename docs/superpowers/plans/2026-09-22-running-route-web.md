# Running Route Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주소 검색·지도 클릭·현재 위치로 지점을 정하고 하천변 보행로를 우선하는 A, 녹도·겸용도로를 허용하는 B, 보행 최단거리 C를 비교하는 모바일 대응 웹 앱을 GitHub Pages에 배포한다.

**Architecture:** Vite 기반 정적 웹 앱에서 Leaflet로 OpenStreetMap을 표시한다. Photon은 지오코딩, BRouter는 앱에 포함된 보행 프로필 등록과 경로 계산을 담당한다. 외부 API 호출, 경로 분석, 지도 표현, UI 제어를 작은 ES 모듈로 분리하고 Vitest로 네트워크와 순수 로직을 검증한다.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Vite, Vitest, jsdom, Leaflet, OpenStreetMap, Photon, BRouter, GitHub Actions/Pages

---

## 파일 구조

- `index.html`: 접근 가능한 검색 폼, 경로 카드, 지도 컨테이너
- `src/main.js`: 의존성을 조립하고 앱 시작
- `src/app.js`: 사용자 이벤트, 상태, 검색·경로 조회 흐름 제어
- `src/styles.css`: 데스크톱·모바일 반응형 UI
- `src/config.js`: 외부 서비스 URL과 경로 색상
- `src/services/geocoding.js`: Photon 검색·역지오코딩
- `src/services/routing.js`: BRouter 프로필 등록, 경로 요청, 1회 재시도
- `src/routing/profiles.js`: A/B/C 보행 프로필 문자열
- `src/routing/analyze-route.js`: BRouter 메시지를 거리·길 유형 통계로 변환
- `src/map/create-map.js`: Leaflet 지도, 마커, 경로 레이어, 지도 클릭
- `tests/*.test.js`: 각 모듈의 단위·통합 테스트
- `.github/workflows/pages.yml`: GitHub Pages 빌드·배포
- `README.md`: 실행, 사용, 외부 서비스와 안전 한계

### Task 1: Vite 프로젝트와 접근 가능한 화면 골격

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/config.js`
- Create: `src/main.js`
- Create: `src/app.js`
- Create: `src/styles.css`
- Create: `tests/app-shell.test.js`

- [ ] **Step 1: 화면 골격의 실패 테스트 작성**

```js
// tests/app-shell.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

beforeEach(() => {
  document.body.innerHTML = `
    <form id="route-form"><input id="start-input"><ul id="start-results"></ul><input id="end-input"><ul id="end-results"></ul><button type="submit">검색</button></form>
    <button id="use-location"></button><button id="pick-start"></button><button id="pick-end"></button><button id="fit-routes"></button>
    <p id="status" aria-live="polite"></p><button id="retry" hidden></button><section id="route-list"></section>`;
});

describe('createApp', () => {
  it('초기 안내를 표시한다', () => {
    createApp({ document });
    expect(document.querySelector('#status').textContent).toBe('출발지와 도착지를 선택해주세요.');
  });
});
```

- [ ] **Step 2: 테스트가 모듈 없음으로 실패하는지 확인**

Run: `npm install && npm test -- tests/app-shell.test.js`
Expected: FAIL with `Cannot find module '../src/app.js'`

- [ ] **Step 3: 프로젝트 설정과 최소 앱 구현**

```json
// package.json
{
  "name": "run-route",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": { "leaflet": "^1.9.4" },
  "devDependencies": { "jsdom": "^26.1.0", "vite": "^7.1.7", "vitest": "^3.2.4" }
}
```

```js
// vite.config.js
import { defineConfig } from 'vite';
export default defineConfig({
  base: '/run/',
  test: { environment: 'jsdom', restoreMocks: true }
});
```

```js
// src/config.js
export const PHOTON_URL = 'https://photon.komoot.io';
export const BROUTER_URL = 'https://brouter.de/brouter';
export const ROUTE_COLORS = { A: '#087f5b', B: '#74a814', C: '#6b7280' };
export const DEFAULT_CENTER = [37.466, 127.133];
export const DEFAULT_ZOOM = 13;
```

```js
// src/app.js
export function createApp({ document }) {
  const status = document.querySelector('#status');
  status.textContent = '출발지와 도착지를 선택해주세요.';
  return { destroy() {} };
}
```

```js
// src/main.js
import './styles.css';
import { createApp } from './app.js';
createApp({ document });
```

```html
<!-- index.html -->
<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RUN ROUTE</title></head>
<body><main id="app" class="layout">
  <aside class="panel"><h1>RUN ROUTE</h1>
    <form id="route-form">
      <label for="start-input">출발지</label><input id="start-input" autocomplete="off" aria-controls="start-results"><ul id="start-results" role="listbox"></ul>
      <label for="end-input">도착지</label><input id="end-input" autocomplete="off" aria-controls="end-results"><ul id="end-results" role="listbox"></ul>
      <div><button type="button" id="use-location">현재 위치를 출발지로</button><button type="button" id="pick-start">지도에서 출발지 선택</button><button type="button" id="pick-end">지도에서 도착지 선택</button></div>
      <button type="submit">러닝 경로 찾기</button>
    </form>
    <p id="status" class="status" aria-live="polite"></p><button id="retry" type="button" hidden>다시 시도</button><section id="route-list" aria-label="추천 경로"></section><p class="safety">지도와 실제 공사·침수·통제 상태가 다를 수 있으니 현장을 확인하세요.</p>
  </aside>
  <div id="map" class="map" role="application" aria-label="러닝 경로 지도"></div>
  <div class="map-actions"><button id="fit-routes" type="button">전체 경로 보기</button></div>
</main><script type="module" src="/src/main.js"></script></body></html>
```

```css
/* src/styles.css — Task 7에서 확장 */
html,body,#app{height:100%;margin:0}.layout{display:grid;grid-template-columns:380px 1fr}.panel{padding:20px;overflow:auto}.map{height:100%}
```

- [ ] **Step 4: 테스트와 빌드 확인**

Run: `npm test -- tests/app-shell.test.js && npm run build`
Expected: 1 test PASS, Vite build exits 0 and creates `dist/`

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json vite.config.js index.html src tests/app-shell.test.js
git commit -m "feat(apps/run): Scaffold the route web app"
```

### Task 2: 주소 검색과 역지오코딩

**Files:**
- Create: `src/services/geocoding.js`
- Create: `tests/geocoding.test.js`

- [ ] **Step 1: Photon 응답 정규화 실패 테스트 작성**

```js
// tests/geocoding.test.js
import { describe, expect, it, vi } from 'vitest';
import { reversePlace, searchPlaces } from '../src/services/geocoding.js';

const feature = {
  geometry: { coordinates: [127.14246, 37.48913] },
  properties: { name: '밀파니 타워', street: '위례서로', housenumber: '273', city: '서울특별시' }
};

describe('Photon client', () => {
  it('검색 결과를 앱 좌표 형식으로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
    await expect(searchPlaces('밀파니 타워', fetchImpl)).resolves.toEqual([
      { label: '밀파니 타워, 위례서로 273, 서울특별시', lat: 37.48913, lng: 127.14246 }
    ]);
  });

  it('역지오코딩 결과가 없으면 좌표 라벨을 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });
    await expect(reversePlace({ lat: 37.5, lng: 127.1 }, fetchImpl)).resolves.toEqual({
      label: '37.50000, 127.10000', lat: 37.5, lng: 127.1
    });
  });

  it('HTTP 오류를 일관된 오류로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(searchPlaces('서울', fetchImpl)).rejects.toThrow('주소 검색 서비스를 사용할 수 없습니다.');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/geocoding.test.js`
Expected: FAIL with module not found

- [ ] **Step 3: 최소 Photon 클라이언트 구현**

```js
// src/services/geocoding.js
import { PHOTON_URL } from '../config.js';

function labelOf(properties = {}) {
  const road = [properties.street, properties.housenumber].filter(Boolean).join(' ');
  return [properties.name, road, properties.district, properties.city].filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index).join(', ');
}

function normalize(feature, fallback) {
  const [lng, lat] = feature?.geometry?.coordinates ?? [fallback.lng, fallback.lat];
  return { label: labelOf(feature?.properties) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('주소 검색 서비스를 사용할 수 없습니다.');
  return response.json();
}

export async function searchPlaces(query, fetchImpl = fetch) {
  if (query.trim().length < 2) return [];
  const url = new URL('/api/', PHOTON_URL);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', '5');
  const data = await getJson(url, fetchImpl);
  return data.features.map(feature => normalize(feature, { lat: 0, lng: 0 }));
}

export async function reversePlace(point, fetchImpl = fetch) {
  const url = new URL('/reverse', PHOTON_URL);
  url.searchParams.set('lat', point.lat);
  url.searchParams.set('lon', point.lng);
  const data = await getJson(url, fetchImpl);
  return normalize(data.features[0], point);
}
```

- [ ] **Step 4: 테스트 확인**

Run: `npm test -- tests/geocoding.test.js`
Expected: 3 tests PASS

- [ ] **Step 5: 커밋**

```bash
git add src/services/geocoding.js tests/geocoding.test.js
git commit -m "feat(apps/run): Add address geocoding"
```

### Task 3: 보행 우선 BRouter 프로필과 경로 클라이언트

**Files:**
- Create: `src/routing/profiles.js`
- Create: `src/services/routing.js`
- Create: `tests/profiles.test.js`
- Create: `tests/routing.test.js`

- [ ] **Step 1: 프로필 우선순위와 API 동작 실패 테스트 작성**

```js
// tests/profiles.test.js
import { describe, expect, it } from 'vitest';
import { ROUTE_PROFILES } from '../src/routing/profiles.js';

describe('route profiles', () => {
  it('A는 보행로를 자전거도로와 계단보다 우선한다', () => {
    expect(ROUTE_PROFILES.A).toContain('highway=footway|pedestrian');
    expect(ROUTE_PROFILES.A).toContain('highway=cycleway then 4');
    expect(ROUTE_PROFILES.A).toContain('highway=steps then 10000');
  });
  it('모든 프로필이 보행 금지 길을 차단한다', () => {
    Object.values(ROUTE_PROFILES).forEach(profile => expect(profile).toContain('assign accesspenalty switch footaccess 0 100000'));
  });
});
```

```js
// tests/routing.test.js
import { describe, expect, it, vi } from 'vitest';
import { createRoutingClient } from '../src/services/routing.js';

const ok = body => ({ ok: true, json: async () => body });

describe('routing client', () => {
  it('프로필을 한 번 등록하고 A/B/C 경로를 요청한다', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ profileid: 'custom_a' }))
      .mockResolvedValueOnce(ok({ profileid: 'custom_b' }))
      .mockResolvedValueOnce(ok({ profileid: 'custom_c' }))
      .mockResolvedValue(ok({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }] }));
    const client = createRoutingClient({ fetchImpl });
    const routes = await client.getRoutes({ lat: 37.44, lng: 127.12 }, { lat: 37.48, lng: 127.14 });
    expect(routes.map(route => route.mode)).toEqual(['A', 'B', 'C']);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/profiles.test.js tests/routing.test.js`
Expected: FAIL with both modules missing

- [ ] **Step 3: 세 보행 프로필 구현**

```js
// src/routing/profiles.js
const global = `---context:global
assign processUnusedTags = true
assign validForFoot = true
assign downhillcost = 0
assign downhillcutoff = 1.5
assign uphillcost = 0
assign uphillcutoff = 1.5
assign turnInstructionMode = 1

---context:way
assign turncost = 0
assign initialclassifier = 0
assign initialcost = 0
assign defaultaccess
  switch access=
    ( if motorroad=yes then false
      else if highway=motorway|motorway_link then false
      else true )
    switch or access=private access=no false true
assign footaccess
  switch foot=
    defaultaccess
    not or foot=private or foot=no foot=use_sidepath
assign accesspenalty switch footaccess 0 100000
`;

const node = `
assign priorityclassifier = 0
assign classifiermask = 0

---context:node
assign defaultaccess
  switch access= 1 switch or access=private access=no 0 1
assign footaccess
  switch foot= defaultaccess switch or foot=private foot=no 0 1
assign initialcost switch footaccess 0 1000000
`;

function profile(costRules) {
  return `${global}\nassign costfactor\n  add accesspenalty\n  ${costRules}\n${node}`;
}

export const ROUTE_PROFILES = {
  A: profile(`if highway=footway|pedestrian then 1
  else if highway=path then 1.1
  else if highway=track then 1.5
  else if highway=cycleway then 4
  else if highway=steps then 10000
  else if highway=living_street then 5
  else if highway=residential|service|unclassified then 8
  else if highway=tertiary|tertiary_link then 20
  else if highway=secondary|secondary_link then 40
  else if highway=primary|primary_link|trunk|trunk_link then 80
  else if route=ferry then 100
  else 10`),
  B: profile(`if highway=footway|pedestrian|path then 1
  else if highway=cycleway then 1.2
  else if highway=track then 1.4
  else if highway=steps then 3
  else if highway=living_street then 3
  else if highway=residential|service|unclassified then 5
  else if highway=tertiary|tertiary_link then 12
  else if highway=secondary|secondary_link then 25
  else if highway=primary|primary_link|trunk|trunk_link then 50
  else if route=ferry then 100
  else 8`),
  C: profile(`if highway=motorway|motorway_link|proposed|abandoned|construction then 100000
  else if route=ferry then 5.67
  else 1`)
};
```

- [ ] **Step 4: 프로필 등록·경로 요청과 1회 재등록 구현**

```js
// src/services/routing.js
import { BROUTER_URL } from '../config.js';
import { ROUTE_PROFILES } from '../routing/profiles.js';

export function createRoutingClient({ fetchImpl = fetch } = {}) {
  let profileIds = {};

  async function upload(mode) {
    const response = await fetchImpl(`${BROUTER_URL}/profile`, { method: 'POST', body: ROUTE_PROFILES[mode] });
    const data = await response.json();
    if (!response.ok || data.error || !data.profileid) throw new Error('러닝 경로 서비스를 사용할 수 없습니다.');
    profileIds[mode] = data.profileid;
    return data.profileid;
  }

  async function request(mode, start, end, canRetry = true) {
    const profile = profileIds[mode] || await upload(mode);
    const url = new URL(BROUTER_URL);
    url.searchParams.set('lonlats', `${start.lng},${start.lat}|${end.lng},${end.lat}`);
    url.searchParams.set('profile', profile);
    url.searchParams.set('alternativeidx', '0');
    url.searchParams.set('format', 'geojson');
    const response = await fetchImpl(url);
    if (!response.ok && canRetry) {
      delete profileIds[mode];
      return request(mode, start, end, false);
    }
    if (!response.ok) throw new Error('러닝 경로를 찾지 못했습니다. 지점을 조금 옮겨 다시 시도해주세요.');
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) throw new Error('러닝 경로를 찾지 못했습니다. 지점을 조금 옮겨 다시 시도해주세요.');
    return { mode, feature };
  }

  return {
    getRoutes(start, end) {
      return Promise.all(['A', 'B', 'C'].map(mode => request(mode, start, end)));
    }
  };
}
```

- [ ] **Step 5: 테스트와 실제 프로필 유효성 확인**

Run: `npm test -- tests/profiles.test.js tests/routing.test.js`
Expected: all tests PASS

Run: `curl -sS -X POST --data-binary @<(node -e "import('./src/routing/profiles.js').then(m=>process.stdout.write(m.ROUTE_PROFILES.A))") https://brouter.de/brouter/profile`
Expected: JSON containing `"profileid":"custom_..."` with no `error`

- [ ] **Step 6: 커밋**

```bash
git add src/routing src/services/routing.js tests/profiles.test.js tests/routing.test.js
git commit -m "feat(apps/run): Add pedestrian-first route profiles"
```

### Task 4: 경로 통계와 탄천 보행로 안내

**Files:**
- Create: `src/routing/analyze-route.js`
- Create: `tests/analyze-route.test.js`

- [ ] **Step 1: 메시지 집계 실패 테스트 작성**

```js
// tests/analyze-route.test.js
import { describe, expect, it } from 'vitest';
import { analyzeRoute } from '../src/routing/analyze-route.js';

const feature = { properties: {
  'track-length': '6200',
  messages: [
    ['Longitude','Latitude','Elevation','Distance','CostPerKm','ElevCost','TurnCost','NodeCost','InitialCost','WayTags'],
    ['0','0','0','3000','0','0','0','0','0','highway=footway'],
    ['0','0','0','2500','0','0','0','0','0','highway=cycleway foot=designated'],
    ['0','0','0','600','0','0','0','0','0','highway=residential'],
    ['0','0','0','100','0','0','0','0','0','highway=steps']
  ]
}};

describe('analyzeRoute', () => {
  it('길 유형, 시간, 겸용도로 안내를 계산한다', () => {
    expect(analyzeRoute(feature)).toEqual({
      distanceM: 6200, minutes: 41, pedestrianPercent: 89, roadM: 600,
      stepsM: 100, sharedCyclewayM: 2500, showPedestrianSideHint: true, showStructureHint: false
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/analyze-route.test.js`
Expected: FAIL with module missing

- [ ] **Step 3: 메시지 헤더 기반 집계 구현**

```js
// src/routing/analyze-route.js
function tagsOf(text = '') {
  return Object.fromEntries(text.split(' ').filter(part => part.includes('=')).map(part => part.split(/=(.*)/s).slice(0, 2)));
}

export function analyzeRoute(feature) {
  const messages = feature.properties?.messages ?? [];
  const header = messages[0] ?? [];
  const distanceIndex = header.indexOf('Distance');
  const tagsIndex = header.indexOf('WayTags');
  let pedestrianM = 0, roadM = 0, stepsM = 0, sharedCyclewayM = 0, structureM = 0;

  for (const row of messages.slice(1)) {
    const distance = Number(row[distanceIndex] ?? 0);
    const tags = tagsOf(row[tagsIndex]);
    const highway = tags.highway;
    if (['footway', 'pedestrian', 'path', 'track', 'cycleway'].includes(highway)) pedestrianM += distance;
    if (['living_street', 'residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk'].includes(highway)) roadM += distance;
    if (highway === 'steps') stepsM += distance;
    if (highway === 'cycleway' && ['yes', 'designated', 'permissive'].includes(tags.foot)) sharedCyclewayM += distance;
    if (tags.bridge === 'yes' || tags.tunnel === 'yes') structureM += distance;
  }

  const distanceM = Number(feature.properties?.['track-length'] ?? 0);
  return {
    distanceM,
    minutes: Math.round((distanceM / 1000) * 6.5),
    pedestrianPercent: distanceM ? Math.round((pedestrianM / distanceM) * 100) : 0,
    roadM, stepsM, sharedCyclewayM,
    showPedestrianSideHint: sharedCyclewayM > 0,
    showStructureHint: structureM > 0
  };
}
```

- [ ] **Step 4: 테스트 확인**

Run: `npm test -- tests/analyze-route.test.js`
Expected: 1 test PASS

- [ ] **Step 5: 커밋**

```bash
git add src/routing/analyze-route.js tests/analyze-route.test.js
git commit -m "feat(apps/run): Analyze route surface statistics"
```

### Task 5: Leaflet 지도와 A/B/C 레이어 전환

**Files:**
- Create: `src/map/create-map.js`
- Create: `tests/map-style.test.js`

- [ ] **Step 1: 선택 경로 스타일 실패 테스트 작성**

```js
// tests/map-style.test.js
import { describe, expect, it } from 'vitest';
import { routeStyle } from '../src/map/create-map.js';

describe('routeStyle', () => {
  it('선택 경로를 굵고 불투명하게 만든다', () => {
    expect(routeStyle('A', 'A')).toMatchObject({ color: '#087f5b', weight: 8, opacity: 1 });
    expect(routeStyle('B', 'A')).toMatchObject({ weight: 4, opacity: 0.28 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/map-style.test.js`
Expected: FAIL with module missing

- [ ] **Step 3: 지도 어댑터 구현**

```js
// src/map/create-map.js
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTER, DEFAULT_ZOOM, ROUTE_COLORS } from '../config.js';

export function routeStyle(mode, selected) {
  return { color: ROUTE_COLORS[mode], weight: mode === selected ? 8 : 4, opacity: mode === selected ? 1 : 0.28, dashArray: mode === 'C' ? '8 7' : null };
}

export function createRouteMap(element, { onMapClick } = {}) {
  const map = L.map(element).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  const routeLayers = new Map();
  let startMarker, endMarker, selected = 'A';
  map.on('click', event => onMapClick?.({ lat: event.latlng.lat, lng: event.latlng.lng }));

  function setPoint(kind, point) {
    const previous = kind === 'start' ? startMarker : endMarker;
    previous?.remove();
    const marker = L.marker([point.lat, point.lng]).addTo(map).bindPopup(kind === 'start' ? '출발' : '도착');
    if (kind === 'start') startMarker = marker; else endMarker = marker;
  }

  function setRoutes(routes) {
    routeLayers.forEach(layer => layer.remove());
    routeLayers.clear();
    routes.forEach(({ mode, feature }) => {
      routeLayers.set(mode, L.geoJSON(feature, { style: routeStyle(mode, selected) }).addTo(map));
    });
    fitRoutes();
  }

  function selectRoute(mode) {
    selected = mode;
    routeLayers.forEach((layer, key) => layer.setStyle(routeStyle(key, selected)));
    routeLayers.get(mode)?.bringToFront();
  }

  function fitRoutes() {
    if (!routeLayers.size) return;
    const bounds = L.featureGroup([...routeLayers.values()]).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28] });
  }

  return { setPoint, setRoutes, selectRoute, fitRoutes, locate: () => map.locate({ setView: true, maxZoom: 16 }) };
}
```

- [ ] **Step 4: 테스트 확인**

Run: `npm test -- tests/map-style.test.js`
Expected: 1 test PASS

- [ ] **Step 5: 커밋**

```bash
git add src/map/create-map.js tests/map-style.test.js
git commit -m "feat(apps/run): Add interactive route map"
```

### Task 6: 검색·현재 위치·지도 선택·경로 카드 통합

**Files:**
- Modify: `src/app.js`
- Modify: `src/main.js`
- Modify: `index.html`
- Create: `tests/app-flow.test.js`

- [ ] **Step 1: 전체 사용자 흐름 실패 테스트 작성**

```js
// tests/app-flow.test.js
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

describe('route search flow', () => {
  it('두 지점이 있으면 세 경로를 지도와 카드에 표시한다', async () => {
    document.body.innerHTML = `<form id="route-form"><input id="start-input"><input id="end-input"><button type="submit">검색</button></form><button id="use-location"></button><button id="pick-start"></button><button id="pick-end"></button><button id="fit-routes"></button><button id="retry" hidden></button><p id="status"></p><section id="route-list"></section><ul id="start-results"></ul><ul id="end-results"></ul>`;
    const map = { setPoint: vi.fn(), setRoutes: vi.fn(), selectRoute: vi.fn(), fitRoutes: vi.fn() };
    const feature = { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } };
    const routing = { getRoutes: vi.fn().mockResolvedValue(['A','B','C'].map(mode => ({ mode, feature }))) };
    const app = createApp({ document, map, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });
    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(map.setRoutes).toHaveBeenCalledOnce());
    expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/app-flow.test.js`
Expected: FAIL because `setPoint` and integrations do not exist

- [ ] **Step 3: 앱 컨트롤러 구현**

`src/app.js`에서 다음을 완성한다.

```js
import { analyzeRoute } from './routing/analyze-route.js';

export function createApp({ document, map, routing, geocoding, navigator = window.navigator }) {
  const state = { start: null, end: null, pickMode: null, routes: [] };
  const status = document.querySelector('#status');
  const routeList = document.querySelector('#route-list');

  function setStatus(message) { status.textContent = message; }
  function setPoint(kind, point) {
    state[kind] = point;
    document.querySelector(`#${kind}-input`).value = point.label;
    map?.setPoint(kind, point);
    setStatus(state.start && state.end ? '러닝 경로를 찾을 수 있습니다.' : '나머지 지점을 선택해주세요.');
  }

  function renderRoutes(routes) {
    routeList.replaceChildren(...routes.map(({ mode, feature }) => {
      const stats = analyzeRoute(feature);
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.routeMode = mode; button.className = `route-card ${mode === 'A' ? 'selected' : ''}`;
      button.innerHTML = `<strong>${mode} · ${mode === 'A' ? '하천변 보행로 우선' : mode === 'B' ? '녹도·겸용도로 우선' : '보행 최단거리'}</strong><span>${(stats.distanceM / 1000).toFixed(1)}km · 약 ${stats.minutes}분</span><small>보행로 ${stats.pedestrianPercent}% · 자동차 도로 ${stats.roadM}m · 계단 ${stats.stepsM}m</small>${stats.showPedestrianSideHint ? '<em>자전거도로 옆 보행로를 이용하세요.</em>' : ''}${stats.showStructureHint ? '<em>교량·지하통로의 현장 통제 상태를 확인하세요.</em>' : ''}`;
      button.addEventListener('click', () => {
        document.querySelectorAll('.route-card').forEach(card => card.classList.toggle('selected', card === button));
        map.selectRoute(mode);
      });
      return button;
    }));
  }

  document.querySelector('#route-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.start || !state.end) return setStatus('출발지와 도착지를 모두 선택해주세요.');
    try {
      setStatus('보행로를 분석해 러닝 경로를 찾고 있습니다…');
      state.routes = await routing.getRoutes(state.start, state.end);
      map.setRoutes(state.routes); renderRoutes(state.routes); setStatus('A 경로를 추천합니다.');
    } catch (error) { setStatus(`${error.message} 다시 시도해주세요.`); }
  });

  document.querySelector('#use-location').addEventListener('click', () => {
    navigator.geolocation?.getCurrentPosition(
      async position => setPoint('start', await geocoding.reversePlace({ lat: position.coords.latitude, lng: position.coords.longitude })),
      () => setStatus('현재 위치 권한이 없습니다. 주소 검색이나 지도 선택을 이용해주세요.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
  document.querySelector('#pick-start').addEventListener('click', () => { state.pickMode = 'start'; setStatus('지도에서 출발지를 선택하세요.'); });
  document.querySelector('#pick-end').addEventListener('click', () => { state.pickMode = 'end'; setStatus('지도에서 도착지를 선택하세요.'); });
  document.querySelector('#fit-routes').addEventListener('click', () => map.fitRoutes());

  async function handleMapClick(point) {
    if (!state.pickMode) return;
    const kind = state.pickMode; state.pickMode = null;
    try { setPoint(kind, await geocoding.reversePlace(point)); }
    catch { setPoint(kind, { ...point, label: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` }); }
  }

  setStatus('출발지와 도착지를 선택해주세요.');
  return { setPoint, handleMapClick, destroy() {} };
}
```

`createApp` 안에서 아래 검색 바인딩을 호출한다.

```js
function bindSearch(kind) {
  const input = document.querySelector(`#${kind}-input`);
  const list = document.querySelector(`#${kind}-results`);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const places = await geocoding.searchPlaces(input.value);
        const rows = places.length ? places : [{ empty: true, label: '검색 결과가 없습니다.' }];
        list.replaceChildren(...rows.map(place => {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = place.label; button.disabled = Boolean(place.empty);
          if (!place.empty) button.addEventListener('click', () => { setPoint(kind, place); list.replaceChildren(); });
          item.append(button); return item;
        }));
      } catch (error) { setStatus(`${error.message} 지도에서 직접 선택할 수도 있습니다.`); }
    }, 350);
  });
  input.addEventListener('keydown', event => { if (event.key === 'Escape') list.replaceChildren(); });
}
bindSearch('start'); bindSearch('end');
```

```js
// src/main.js
import './styles.css';
import { createApp } from './app.js';
import { createRouteMap } from './map/create-map.js';
import { createRoutingClient } from './services/routing.js';
import { searchPlaces, reversePlace } from './services/geocoding.js';

let app;
const map = createRouteMap(document.querySelector('#map'), { onMapClick: point => app?.handleMapClick(point) });
app = createApp({ document, map, routing: createRoutingClient(), geocoding: { searchPlaces, reversePlace } });
```

- [ ] **Step 4: 통합 테스트 확인**

Run: `npm test -- tests/app-flow.test.js`
Expected: 1 test PASS

- [ ] **Step 5: 전체 테스트 확인**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 6: 커밋**

```bash
git add index.html src/app.js src/main.js tests/app-flow.test.js
git commit -m "feat(apps/run): Integrate route search interactions"
```

### Task 7: 모바일 UI, 오류 상태, 접근성 마감

**Files:**
- Modify: `src/styles.css`
- Modify: `index.html`
- Modify: `src/app.js`
- Create: `tests/accessibility.test.js`

- [ ] **Step 1: 핵심 접근성 속성 실패 테스트 작성**

```js
// tests/accessibility.test.js
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('page accessibility', () => {
  it('지도와 상태, 검색 목록에 접근 가능한 이름을 제공한다', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    expect(html).toContain('aria-label="러닝 경로 지도"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="listbox"');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/accessibility.test.js`
Expected: FAIL until all attributes are present

- [ ] **Step 3: 반응형 스타일과 사용자 상태 완성**

`src/styles.css`에서 다음 기준을 구현한다.

```css
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17231c;background:#f5f7f6}
*{box-sizing:border-box}body{margin:0}.layout{height:100vh;display:grid;grid-template-columns:380px 1fr}.panel{z-index:500;background:#fff;padding:20px;overflow:auto;box-shadow:4px 0 20px #253b2d20}.map{height:100%;min-height:420px}.route-card{display:grid;width:100%;text-align:left;border:1px solid #d8e1db;border-radius:12px;background:#fff;padding:12px;margin:8px 0;gap:6px}.route-card.selected{border:2px solid #087f5b;background:#f0faf5}.route-card em{color:#8a5b00;background:#fff5d8;padding:6px;border-radius:6px;font-style:normal}.status{min-height:24px;color:#46554b}.map-actions{position:absolute;right:16px;bottom:20px;z-index:550}
@media(max-width:720px){.layout{display:block}.map{height:100vh}.panel{position:absolute;left:10px;right:10px;bottom:10px;max-height:52vh;border-radius:18px;padding:14px;box-shadow:0 0 22px #0004}.map-actions{bottom:54vh}.route-card small{display:none}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
```

`src/app.js`의 제출 흐름을 아래 함수로 추출해 재시도와 로딩 상태를 연결한다.

```js
const submit = document.querySelector('#route-form button[type="submit"]');
const retry = document.querySelector('#retry');
async function runRouteSearch() {
  if (!state.start || !state.end) return setStatus('출발지와 도착지를 모두 선택해주세요.');
  submit.disabled = true; retry.hidden = true;
  try {
    setStatus('보행로를 분석해 러닝 경로를 찾고 있습니다…');
    state.routes = await routing.getRoutes(state.start, state.end);
    map.setRoutes(state.routes); renderRoutes(state.routes); setStatus('A 경로를 추천합니다.');
  } catch (error) {
    setStatus(`${error.message} 다시 시도해주세요.`); retry.hidden = false;
  } finally { submit.disabled = false; }
}
document.querySelector('#route-form').addEventListener('submit', event => { event.preventDefault(); runRouteSearch(); });
retry.addEventListener('click', runRouteSearch);
window.addEventListener('offline', () => setStatus('인터넷 연결이 끊겼습니다. 연결 후 다시 시도해주세요.'));
```

모든 아이콘 버튼에는 텍스트 또는 `aria-label`을 제공한다.

- [ ] **Step 4: 테스트와 빌드 확인**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0

- [ ] **Step 5: 로컬 모바일 확인**

Run: `npm run dev -- --host 0.0.0.0`
Expected: 출력된 LAN URL을 휴대폰 또는 Chrome 모바일 에뮬레이션에서 열었을 때 지도는 전체 화면이고 하단 패널이 화면의 절반을 넘지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add index.html src/app.js src/styles.css tests/accessibility.test.js
git commit -m "feat(apps/run): Polish responsive route experience"
```

### Task 8: 문서, GitHub Pages 배포, 실제 경로 검증

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `README.md`
- Create: `.gitignore`

- [ ] **Step 1: 배포 워크플로 작성**

```yaml
# .github/workflows/pages.yml
name: Deploy GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

```gitignore
# .gitignore
node_modules/
dist/
.DS_Store
.superpowers/
```

````markdown
<!-- README.md -->
# RUN ROUTE

하천변 보행로와 산책로를 우선해 A/B/C 러닝 경로를 비교하는 정적 웹 앱입니다.

## 로컬 실행

```bash
npm ci
npm run dev
```

## 경로 유형

- A: 보행 전용길 우선, 계단·자동차 도로 강한 회피
- B: 녹도와 보행 가능한 자전거 겸용도로 허용
- C: 보행 가능한 최단거리

지도는 © OpenStreetMap contributors 데이터를 사용하고 Leaflet으로 표시합니다. 주소 검색은 Photon, 경로 계산은 BRouter 무료 공개 서비스를 저빈도로 사용합니다. 위치와 검색 기록은 저장하지 않습니다.

지도 데이터와 실제 공사·침수·통제 상태가 다를 수 있습니다. 하천변, 교량, 지하통로, 자전거 겸용도로에서는 현장 상태를 확인하고 안전하게 통행하세요.
````

- [ ] **Step 2: 전체 자동 검증**

Run: `npm ci && npm test && npm run build`
Expected: all tests PASS and `dist/index.html` exists

- [ ] **Step 3: 로컬 실제 경로 검증**

Run: `npm run dev`

브라우저에서 출발지를 첨부 지도 기준 태평동 탄천 진입점으로 지도 클릭하고 도착지를 `위례서로 273`으로 검색한다. 다음을 확인한다.

- A/B/C 세 선이 모두 표시된다.
- A 카드와 선이 기본 선택된다.
- A는 탄천 동측 하천 통로를 따라 북상한다.
- A의 겸용도로 구간에는 `자전거도로 옆 보행로를 이용하세요.`가 표시된다.
- 카드 선택 시 해당 선만 굵게 강조된다.
- 주소 검색 실패와 위치 권한 거부 문구가 표시된다.

- [ ] **Step 4: 배포 파일 커밋**

```bash
git add .github/workflows/pages.yml .gitignore README.md
git commit -m "chore(apps/run): Configure GitHub Pages deployment"
```

- [ ] **Step 5: 공개 저장소 생성과 푸시**

Run:

```bash
gh auth status
gh repo create Lucas-OH-1/run --public --source=. --remote=origin --push
gh api --method POST repos/Lucas-OH-1/run/pages -f build_type=workflow || true
gh workflow run pages.yml --repo Lucas-OH-1/run
```

Expected: `Lucas-OH-1`이 active account이고 `https://github.com/Lucas-OH-1/run` 저장소가 생성된다. 기존 GitHub Project는 수정하거나 삭제하지 않는다.

- [ ] **Step 6: Actions와 Pages 상태 확인**

Run:

```bash
gh run watch --repo Lucas-OH-1/run --exit-status
gh api repos/Lucas-OH-1/run/pages --jq '.html_url + " " + .status'
```

Expected: workflow concludes `success`; Pages URL은 `https://lucas-oh-1.github.io/run/`; status는 `built`

- [ ] **Step 7: 공개 페이지 최종 확인**

Run:

```bash
curl -fsS https://lucas-oh-1.github.io/run/ | grep -F 'RUN ROUTE'
```

Expected: command exits 0. 휴대폰에서 같은 URL을 열어 주소 검색, 지도 클릭, 현재 위치 권한, A/B/C 강조를 다시 확인한다.
