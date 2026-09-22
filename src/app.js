import { analyzeRoute } from './routing/analyze-route.js';

const INITIAL_STATUS = '출발지와 도착지를 선택해주세요.';
const MODE_TITLES = {
  A: 'A 경로',
  B: 'B 경로',
  C: 'C 경로'
};
const MODE_DESCRIPTIONS = {
  A: '하천변 보행로 우선',
  B: '녹도·겸용도로 우선',
  C: '보행 최단거리'
};
const ROUTE_MODES = new Set(Object.keys(MODE_TITLES));
const ROUTE_FAILURE_STATUS = '경로를 찾지 못했습니다. 지점을 확인한 뒤 다시 시도해주세요.';
const SEARCH_DELAY_MS = 350;

function isValidPoint(point) {
  return (
    point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

function coordinateLabel(point) {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function clearElement(element) {
  if (element) {
    element.replaceChildren();
  }
}

function formatKm(meters) {
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatMeters(meters) {
  return `${Math.round(meters)}m`;
}

function routeMode(route) {
  return route?.mode ?? route?.feature?.properties?.mode;
}

function safeRouteMode(route, index) {
  const mode = routeMode(route);
  const fallback = ['A', 'B', 'C'][index] ?? 'A';
  return ROUTE_MODES.has(mode) ? mode : fallback;
}

function normalizeRoutes(routes) {
  return routes.map((route, index) => {
    const mode = safeRouteMode(route, index);
    if (route && typeof route === 'object' && !Array.isArray(route)) {
      return { ...route, mode };
    }
    return { mode, feature: route };
  });
}

export function createApp({ document, map, routing, geocoding, navigator = window.navigator }) {
  const state = {
    start: null,
    end: null,
    pickMode: null,
    routes: [],
    selectedMode: 'A'
  };
  const timers = new Set();
  const listeners = [];
  const searchGenerations = { start: 0, end: 0 };
  let routeGeneration = 0;
  let reverseGeneration = 0;
  let destroyed = false;

  const form = document.querySelector('#route-form');
  const startInput = document.querySelector('#start-input');
  const endInput = document.querySelector('#end-input');
  const useLocationButton = document.querySelector('#use-location');
  const pickStartButton = document.querySelector('#pick-start');
  const pickEndButton = document.querySelector('#pick-end');
  const fitRoutesButton = document.querySelector('#fit-routes');
  const status = document.querySelector('#status');
  const routeList = document.querySelector('#route-list');
  const startResults = document.querySelector('#start-results');
  const endResults = document.querySelector('#end-results');

  setText(status, INITIAL_STATUS);

  function addListener(element, event, handler) {
    if (!element) {
      return;
    }
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  }

  function updateReadyStatus() {
    if (state.start && state.end) {
      setText(status, '경로를 검색할 수 있습니다.');
      return;
    }
    setText(status, INITIAL_STATUS);
  }

  function hasDisplayedRoutes() {
    return state.routes.length > 0 || (routeList?.querySelector('[data-route-mode]') ?? null) !== null;
  }

  function clearDisplayedRoutes() {
    state.routes = [];
    clearElement(routeList);
    map?.setRoutes?.([]);
  }

  function invalidatePointSelection({ reverse = true } = {}) {
    routeGeneration += 1;
    if (reverse) {
      reverseGeneration += 1;
    }
    if (hasDisplayedRoutes()) {
      clearDisplayedRoutes();
      return;
    }
    state.routes = [];
    clearElement(routeList);
  }

  function setPoint(kind, point) {
    if (destroyed || !['start', 'end'].includes(kind) || !isValidPoint(point)) {
      return;
    }

    invalidatePointSelection();
    const normalized = { label: point.label || coordinateLabel(point), lat: point.lat, lng: point.lng };
    state[kind] = normalized;

    const input = kind === 'start' ? startInput : endInput;
    if (input) {
      input.value = normalized.label;
    }

    ++searchGenerations[kind];
    clearElement(kind === 'start' ? startResults : endResults);
    map?.setPoint?.(kind, normalized);
    updateReadyStatus();
    return normalized;
  }

  function selectRoute(mode) {
    if (destroyed || !ROUTE_MODES.has(mode)) {
      return;
    }
    state.selectedMode = mode;
    const cards = routeList?.querySelectorAll('[data-route-mode]') ?? [];
    for (const card of cards) {
      card.classList.toggle('selected', card.dataset.routeMode === mode);
      card.setAttribute('aria-pressed', String(card.dataset.routeMode === mode));
    }
    map?.selectRoute?.(mode);
  }

  function renderRouteCard(route, index) {
    const mode = safeRouteMode(route, index);
    const analysis = analyzeRoute(route?.feature ?? route);
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.routeMode = mode;
    card.className = mode === state.selectedMode ? 'route-card selected' : 'route-card';
    card.setAttribute('aria-pressed', String(mode === state.selectedMode));

    const hints = [];
    if (analysis.showPedestrianSideHint) {
      hints.push('자전거도로 옆 보행로를 이용하세요.');
    }
    if (analysis.showStructureHint) {
      hints.push('교량·지하통로의 현장 통제 상태를 확인하세요.');
    }

    const title = document.createElement('strong');
    title.textContent = MODE_TITLES[mode];
    const strategy = document.createElement('span');
    strategy.textContent = MODE_DESCRIPTIONS[mode];
    const summary = document.createElement('span');
    summary.textContent = `${formatKm(analysis.distanceM)} · 약 ${analysis.minutes}분`;
    const details = document.createElement('span');
    details.textContent = `보행로 ${analysis.pedestrianPercent}% · 차도 ${formatMeters(analysis.roadM)} · 계단 ${formatMeters(analysis.stepsM)}`;
    card.append(title, strategy, summary, details);
    for (const hint of hints) {
      const hintElement = document.createElement('small');
      hintElement.textContent = hint;
      card.append(hintElement);
    }
    card.addEventListener('click', () => selectRoute(mode));
    return card;
  }

  function renderRoutes(routes) {
    if (destroyed) {
      return;
    }
    clearElement(routeList);
    state.selectedMode = safeRouteMode(routes[0], 0);
    for (const [index, route] of routes.entries()) {
      routeList?.append(renderRouteCard(route, index));
    }
  }

  async function searchRoutes() {
    const generation = ++routeGeneration;
    if (destroyed) {
      return;
    }
    if (!state.start || !state.end) {
      setText(status, '출발지와 도착지를 모두 선택해주세요.');
      return;
    }

    const start = state.start;
    const end = state.end;
    setText(status, '경로를 검색하고 있습니다.');
    try {
      const routes = await routing?.getRoutes?.(start, end);
      if (
        destroyed ||
        generation !== routeGeneration ||
        state.start !== start ||
        state.end !== end
      ) {
        return;
      }
      if (!Array.isArray(routes) || routes.length === 0) {
        clearDisplayedRoutes();
        setText(status, ROUTE_FAILURE_STATUS);
        return;
      }
      state.routes = normalizeRoutes(routes);
      map?.setRoutes?.(state.routes);
      renderRoutes(state.routes);
      selectRoute(state.selectedMode);
      setText(status, `${state.selectedMode} 경로를 추천합니다.`);
    } catch {
      if (
        destroyed ||
        generation !== routeGeneration ||
        state.start !== start ||
        state.end !== end
      ) {
        return;
      }
      clearDisplayedRoutes();
      setText(status, ROUTE_FAILURE_STATUS);
    }
  }

  function reverseOrCoordinate(point, { fallback = true } = {}) {
    if (typeof geocoding?.reversePlace !== 'function') {
      return Promise.resolve({ label: coordinateLabel(point), lat: point.lat, lng: point.lng });
    }
    const reverse = Promise.resolve().then(() => geocoding.reversePlace(point));
    if (!fallback) {
      return reverse;
    }
    return reverse.catch(() => ({ label: coordinateLabel(point), lat: point.lat, lng: point.lng }));
  }

  async function useCurrentLocation() {
    const generation = ++reverseGeneration;
    const geolocation = navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      setText(status, '현재 위치 권한을 사용할 수 없습니다.');
      return;
    }

    setText(status, '현재 위치를 확인하고 있습니다.');
    geolocation.getCurrentPosition(
      position => {
        if (destroyed || generation !== reverseGeneration) {
          return;
        }
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (
          !Number.isFinite(point.lat) ||
          !Number.isFinite(point.lng) ||
          point.lat < -90 ||
          point.lat > 90 ||
          point.lng < -180 ||
          point.lng > 180
        ) {
          setText(status, '현재 위치를 확인할 수 없습니다.');
          return;
        }
        reverseOrCoordinate(point, { fallback: false })
          .then(place => {
            if (destroyed || generation !== reverseGeneration) {
              return;
            }
            setPoint('start', place);
          })
          .catch(() => {
            if (!destroyed && generation === reverseGeneration) {
              setText(status, '현재 위치를 확인할 수 없습니다.');
            }
          });
      },
      () => {
        if (!destroyed && generation === reverseGeneration) {
          setText(status, '현재 위치 권한이 필요합니다.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleMapClick(point) {
    if (destroyed || !state.pickMode) {
      return;
    }
    if (!isValidPoint(point)) {
      setText(status, '지도에서 유효한 위치를 선택해주세요.');
      return;
    }

    const kind = state.pickMode;
    const generation = ++reverseGeneration;
    state.pickMode = null;
    const place = await reverseOrCoordinate(point);
    if (destroyed || generation !== reverseGeneration) {
      return;
    }
    setPoint(kind, place);
  }

  function renderSearchResults(kind, list, places) {
    clearElement(list);
    if (!list) {
      return;
    }

    if (places.length === 0) {
      const row = document.createElement('li');
      row.textContent = '검색 결과가 없습니다.';
      list.append(row);
      return;
    }

    for (const place of places) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = place.label;
      button.addEventListener('click', () => {
        setPoint(kind, place);
        clearElement(list);
      });
      row.append(button);
      list.append(row);
    }
  }

  function setupSearch(kind, input, list) {
    let pendingTimer = null;

    function showSearchFailure() {
      setText(status, '주소 검색에 실패했습니다. 지도에서 직접 선택할 수도 있습니다.');
      clearElement(list);
      const row = document.createElement('li');
      row.textContent = '주소 검색에 실패했습니다.';
      list?.append(row);
    }

    addListener(input, 'input', () => {
      const generation = ++searchGenerations[kind];
      reverseGeneration += 1;
      if (state[kind]) {
        state[kind] = null;
        invalidatePointSelection({ reverse: false });
        updateReadyStatus();
      }
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        timers.delete(pendingTimer);
      }

      pendingTimer = setTimeout(async () => {
        timers.delete(pendingTimer);
        pendingTimer = null;
        if (destroyed || generation !== searchGenerations[kind]) {
          return;
        }
        if (typeof geocoding?.searchPlaces !== 'function') {
          showSearchFailure();
          return;
        }
        try {
          const places = await geocoding.searchPlaces(input.value);
          if (destroyed || generation !== searchGenerations[kind]) {
            return;
          }
          renderSearchResults(kind, list, Array.isArray(places) ? places : []);
        } catch {
          if (destroyed || generation !== searchGenerations[kind]) {
            return;
          }
          showSearchFailure();
        }
      }, SEARCH_DELAY_MS);
      timers.add(pendingTimer);
    });

    addListener(input, 'keydown', event => {
      if (event.key === 'Escape') {
        ++searchGenerations[kind];
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          timers.delete(pendingTimer);
          pendingTimer = null;
        }
        clearElement(list);
      }
    });
  }

  addListener(form, 'submit', event => {
    event.preventDefault();
    void searchRoutes();
  });
  addListener(useLocationButton, 'click', () => void useCurrentLocation());
  addListener(pickStartButton, 'click', () => {
    reverseGeneration += 1;
    state.pickMode = 'start';
    setText(status, '지도에서 출발지를 선택해주세요.');
  });
  addListener(pickEndButton, 'click', () => {
    reverseGeneration += 1;
    state.pickMode = 'end';
    setText(status, '지도에서 도착지를 선택해주세요.');
  });
  addListener(fitRoutesButton, 'click', () => map?.fitRoutes?.());
  setupSearch('start', startInput, startResults);
  setupSearch('end', endInput, endResults);

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    routeGeneration += 1;
    reverseGeneration += 1;
    searchGenerations.start += 1;
    searchGenerations.end += 1;
    for (const remove of listeners.splice(0)) {
      remove();
    }
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    state.pickMode = null;
    clearDisplayedRoutes();
    clearElement(startResults);
    clearElement(endResults);
  }

  return { setPoint, handleMapClick, destroy };
}
