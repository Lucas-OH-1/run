import { analyzeRoute } from './routing/analyze-route.js';

const INITIAL_STATUS = '출발지와 도착지를 선택해주세요.';
const MODE_TITLES = {
  A: 'A 경로',
  B: 'B 경로',
  C: 'C 경로'
};
const SEARCH_DELAY_MS = 350;

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

  function setPoint(kind, point) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return;
    }

    const normalized = { label: point.label || coordinateLabel(point), lat: point.lat, lng: point.lng };
    state[kind] = normalized;

    const input = kind === 'start' ? startInput : endInput;
    if (input) {
      input.value = normalized.label;
    }

    map?.setPoint?.(kind, normalized);
    updateReadyStatus();
    return normalized;
  }

  function selectRoute(mode) {
    state.selectedMode = mode;
    const cards = routeList?.querySelectorAll('[data-route-mode]') ?? [];
    for (const card of cards) {
      card.classList.toggle('selected', card.dataset.routeMode === mode);
      card.setAttribute('aria-pressed', String(card.dataset.routeMode === mode));
    }
    map?.selectRoute?.(mode);
  }

  function renderRouteCard(route, index) {
    const mode = routeMode(route) ?? ['A', 'B', 'C'][index] ?? String(index + 1);
    const analysis = analyzeRoute(route?.feature ?? route);
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.routeMode = mode;
    card.className = mode === state.selectedMode ? 'route-card selected' : 'route-card';
    card.setAttribute('aria-pressed', String(mode === state.selectedMode));

    const hints = [];
    if (analysis.showPedestrianSideHint) {
      hints.push(`자전거·보행 겸용 ${formatMeters(analysis.sharedCyclewayM)}`);
    }
    if (analysis.showStructureHint) {
      hints.push('교량 또는 터널 포함');
    }

    card.innerHTML = `
      <strong>${MODE_TITLES[mode] ?? `${mode} 경로`}</strong>
      <span>${formatKm(analysis.distanceM)} · 약 ${analysis.minutes}분</span>
      <span>보행로 ${analysis.pedestrianPercent}% · 차도 ${formatMeters(analysis.roadM)} · 계단 ${formatMeters(analysis.stepsM)}</span>
      ${hints.map(hint => `<small>${hint}</small>`).join('')}
    `;
    card.addEventListener('click', () => selectRoute(mode));
    return card;
  }

  function renderRoutes(routes) {
    clearElement(routeList);
    state.selectedMode = routeMode(routes[0]) ?? 'A';
    for (const [index, route] of routes.entries()) {
      routeList?.append(renderRouteCard(route, index));
    }
  }

  async function searchRoutes() {
    if (!state.start || !state.end) {
      setText(status, INITIAL_STATUS);
      return;
    }

    setText(status, '경로를 검색하고 있습니다.');
    try {
      const routes = await routing?.getRoutes?.(state.start, state.end);
      state.routes = Array.isArray(routes) ? routes : [];
      map?.setRoutes?.(state.routes);
      renderRoutes(state.routes);
      selectRoute(state.selectedMode);
      setText(status, `${state.selectedMode} 경로를 추천합니다.`);
    } catch {
      setText(status, '경로를 찾지 못했습니다. 지점을 확인한 뒤 다시 시도해주세요.');
    }
  }

  function reverseOrCoordinate(point) {
    if (typeof geocoding?.reversePlace !== 'function') {
      return Promise.resolve({ label: coordinateLabel(point), lat: point.lat, lng: point.lng });
    }
    return geocoding.reversePlace(point).catch(() => ({ label: coordinateLabel(point), lat: point.lat, lng: point.lng }));
  }

  async function useCurrentLocation() {
    const geolocation = navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      setText(status, '현재 위치 권한을 사용할 수 없습니다.');
      return;
    }

    setText(status, '현재 위치를 확인하고 있습니다.');
    geolocation.getCurrentPosition(
      position => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        reverseOrCoordinate(point).then(place => setPoint('start', place));
      },
      () => setText(status, '현재 위치 권한이 필요합니다.')
    );
  }

  async function handleMapClick(point) {
    if (!state.pickMode) {
      return;
    }

    const kind = state.pickMode;
    state.pickMode = null;
    const place = await reverseOrCoordinate(point);
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

    addListener(input, 'input', () => {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        timers.delete(pendingTimer);
      }

      pendingTimer = setTimeout(async () => {
        timers.delete(pendingTimer);
        pendingTimer = null;
        if (typeof geocoding?.searchPlaces !== 'function') {
          clearElement(list);
          return;
        }
        try {
          const places = await geocoding.searchPlaces(input.value);
          renderSearchResults(kind, list, Array.isArray(places) ? places : []);
        } catch {
          clearElement(list);
          const row = document.createElement('li');
          row.textContent = '주소 검색에 실패했습니다. 다시 시도해주세요.';
          list?.append(row);
        }
      }, SEARCH_DELAY_MS);
      timers.add(pendingTimer);
    });

    addListener(input, 'keydown', event => {
      if (event.key === 'Escape') {
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
    state.pickMode = 'start';
    setText(status, '지도에서 출발지를 선택해주세요.');
  });
  addListener(pickEndButton, 'click', () => {
    state.pickMode = 'end';
    setText(status, '지도에서 도착지를 선택해주세요.');
  });
  addListener(fitRoutesButton, 'click', () => map?.fitRoutes?.());
  setupSearch('start', startInput, startResults);
  setupSearch('end', endInput, endResults);

  function destroy() {
    for (const remove of listeners.splice(0)) {
      remove();
    }
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  }

  return { setPoint, handleMapClick, destroy };
}
