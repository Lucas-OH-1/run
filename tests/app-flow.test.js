import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

describe('route search flow', () => {
  beforeEach(() => {
    document.body.innerHTML = `<form id="route-form"><input id="start-input"><input id="end-input"><button type="submit">검색</button></form><button id="use-location"></button><button id="pick-start"></button><button id="pick-end"></button><button id="fit-routes"></button><button id="retry" hidden></button><div id="route-progress" hidden><progress id="route-progress-bar" max="100" value="0"></progress><span id="route-progress-label"></span></div><p id="status"></p><section id="route-list"></section><ul id="start-results"></ul><ul id="end-results"></ul>`;
  });

  it('두 지점이 있으면 세 경로를 지도와 카드에 표시한다', async () => {
    const map = { setPoint: vi.fn(), setRoutes: vi.fn(), selectRoute: vi.fn(), fitRoutes: vi.fn() };
    const feature = { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } };
    const routing = { getRoutes: vi.fn().mockResolvedValue(['A','B','C'].map(mode => ({ mode, feature }))) };
    const app = createApp({ document, map, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });
    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(map.setRoutes).toHaveBeenCalledOnce());
    expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(3);
    expect(map.setRoutes.mock.calls[0][0].map(route => route.mode)).toEqual(['A', 'B', 'C']);
  });

  it('탄천 corridor를 조회하고 네 가지 경로 카드를 표시한다', async () => {
    const map = { setPoint: vi.fn(), setRoutes: vi.fn(), selectRoute: vi.fn() };
    const feature = { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } };
    const corridorResult = { waypoints: [{ lat: 37.41, lng: 127.11 }, { lat: 37.49, lng: 127.14 }] };
    const corridor = { findTancheonCorridor: vi.fn().mockResolvedValue(corridorResult) };
    const routing = { getRoutes: vi.fn().mockResolvedValue(['RIVER', 'SAFE', 'SHORT', 'MIXED'].map(mode => ({ mode, feature }))) };
    const app = createApp({ document, map, routing, corridor, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });

    document.querySelector('#route-form').requestSubmit();

    await vi.waitFor(() => expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(4));
    expect(corridor.findTancheonCorridor).toHaveBeenCalledOnce();
    expect(routing.getRoutes).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      corridor: corridorResult,
      onProgress: expect.any(Function)
    });
    expect(document.querySelector('#route-list').textContent).toContain('탄천자전거도로 필수');
    expect(document.querySelector('#route-list').textContent).toContain('자동차 없는 길');
    expect(document.querySelector('#route-list').textContent).toContain('최단거리');
    expect(document.querySelector('#route-list').textContent).toContain('반반 혼합');
    app.destroy();
  });

  it('탄천 조회와 경로 완료 단계에 맞춰 진행률을 표시한다', async () => {
    let resolveCorridor;
    let reportProgress;
    let resolveRoutes;
    const corridor = { findTancheonCorridor: vi.fn(() => new Promise(resolve => { resolveCorridor = resolve; })) };
    const routing = { getRoutes: vi.fn((start, end, options) => {
      reportProgress = options.onProgress;
      return new Promise(resolve => { resolveRoutes = resolve; });
    }) };
    const app = createApp({ document, corridor, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });

    document.querySelector('#route-form').requestSubmit();
    expect(document.querySelector('#route-progress').hidden).toBe(false);
    expect(document.querySelector('#route-progress-bar').value).toBe(5);

    const corridorResult = { waypoints: [{ lat: 37.41, lng: 127.11 }, { lat: 37.49, lng: 127.14 }] };
    resolveCorridor(corridorResult);
    await vi.waitFor(() => expect(routing.getRoutes).toHaveBeenCalledOnce());
    expect(document.querySelector('#route-progress-bar').value).toBe(30);

    reportProgress({ mode: 'RIVER', completed: 1, total: 4 });
    expect(document.querySelector('#route-progress-bar').value).toBe(43);
    expect(document.querySelector('#route-progress-label').textContent).toContain('탄천자전거도로 필수 계산 완료');

    const feature = { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } };
    resolveRoutes(['RIVER', 'SAFE', 'SHORT', 'MIXED'].map(mode => ({ mode, feature })));
    await vi.waitFor(() => expect(document.querySelector('#route-progress-bar').value).toBe(100));
    app.destroy();
  });

  it('두 지점 없이 제출하면 정확한 안내 문구를 표시한다', () => {
    createApp({ document, geocoding: {}, navigator: {} });

    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(document.querySelector('#status').textContent).toBe('출발지와 도착지를 모두 선택해주세요.');
  });

  it('경로 카드에 전략 설명과 안전 안내를 표시한다', async () => {
    const feature = {
      properties: {
        'track-length': '1000',
        messages: [
          ['Distance', 'WayTags'],
          ['100', 'highway=cycleway foot=yes bridge=yes']
        ]
      },
      geometry: { type: 'LineString', coordinates: [] }
    };
    const routing = { getRoutes: vi.fn().mockResolvedValue([{ mode: 'A', feature }]) };
    const app = createApp({ document, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });
    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.querySelector('[data-route-mode]')).not.toBeNull());
    const text = document.querySelector('[data-route-mode]').textContent;
    expect(text).toContain('하천변 보행로 우선');
    expect(text).toContain('자전거도로 옆 보행로를 이용하세요.');
    expect(text).toContain('교량·지하통로의 현장 통제 상태를 확인하세요.');
    expect(document.querySelector('[data-route-mode]').querySelector('script')).toBeNull();
    app.destroy();
  });

  it('라우팅 결과가 비어 있으면 실패 상태를 표시하고 경로를 선택하지 않는다', async () => {
    const map = { setRoutes: vi.fn(), selectRoute: vi.fn() };
    const routing = { getRoutes: vi.fn().mockResolvedValue([]) };
    const app = createApp({ document, map, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });
    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.querySelector('#status').textContent).toContain('경로를 찾지 못했습니다'));
    expect(map.selectRoute).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(0);
    app.destroy();
  });

  it('주소 검색 실패 시 지도 직접 선택 안내와 결과 메시지를 표시한다', async () => {
    vi.useFakeTimers();
    try {
      const geocoding = { searchPlaces: vi.fn().mockRejectedValue(new Error('network')) };
      const app = createApp({ document, geocoding, navigator: {} });
      const input = document.querySelector('#start-input');
      input.value = '실패 검색';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await Promise.resolve();

      expect(document.querySelector('#status').textContent).toContain('지도에서 직접 선택할 수도 있습니다.');
      expect(document.querySelector('#start-results').textContent).toContain('주소 검색에 실패했습니다.');
      app.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('선택된 주소 입력을 수정하면 표시된 카드와 지도 경로를 즉시 제거한다', async () => {
    const feature = { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } };
    const map = { setRoutes: vi.fn(), selectRoute: vi.fn(), setPoint: vi.fn(), clearPoint: vi.fn() };
    const routing = { getRoutes: vi.fn().mockResolvedValue([{ mode: 'A', feature }]) };
    const app = createApp({ document, map, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });
    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(1));

    const input = document.querySelector('#start-input');
    input.value = '새 출발지';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(0);
    expect(map.setRoutes).toHaveBeenLastCalledWith([]);
    expect(map.clearPoint).toHaveBeenCalledWith('start');
    expect(map.clearPoint).not.toHaveBeenCalledWith('end');
    app.destroy();
  });

  it('destroy 시 지도 정리 함수를 호출한다', () => {
    const map = { setRoutes: vi.fn(), clearPoint: vi.fn(), destroy: vi.fn() };
    const app = createApp({ document, map, geocoding: {}, navigator: {} });

    app.destroy();

    expect(map.destroy).toHaveBeenCalledOnce();
  });

  it('늦게 도착한 현재 위치 역지오코딩은 새로 선택한 출발지를 덮어쓰지 않는다', async () => {
    let resolveReverse;
    const reversePlace = vi.fn(() => new Promise(resolve => { resolveReverse = resolve; }));
    const getCurrentPosition = vi.fn();
    const map = { setPoint: vi.fn() };
    const app = createApp({ document, map, geocoding: { reversePlace }, navigator: { geolocation: { getCurrentPosition } } });

    document.querySelector('#use-location').click();
    getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 37.5, longitude: 127.1 } });
    await vi.waitFor(() => expect(reversePlace).toHaveBeenCalledOnce());
    app.setPoint('start', { label: '직접 선택한 출발지', lat: 37.6, lng: 127.2 });
    resolveReverse({ label: '늦은 현재 위치', lat: 37.5, lng: 127.1 });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.querySelector('#start-input').value).toBe('직접 선택한 출발지');
    expect(map.setPoint).toHaveBeenCalledOnce();
    expect(map.setPoint).toHaveBeenLastCalledWith('start', expect.objectContaining({ label: '직접 선택한 출발지' }));
    app.destroy();
  });

  it('주소 입력을 수정하면 선택 지점과 이전 경로 응답을 무효화한다', async () => {
    let resolveRoutes;
    const routing = { getRoutes: vi.fn(() => new Promise(resolve => { resolveRoutes = resolve; })) };
    const app = createApp({ document, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });
    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    const input = document.querySelector('#start-input');
    input.value = '새 출발지';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    resolveRoutes([{ mode: 'A', feature: { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } } }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(0);
    expect(document.querySelector('#status').textContent).toBe('출발지와 도착지를 선택해주세요.');
    app.destroy();
  });

  it('Escape는 주소 검색 debounce와 이전 응답을 무효화한다', async () => {
    vi.useFakeTimers();
    try {
      let resolveSearch;
      const geocoding = { searchPlaces: vi.fn(() => new Promise(resolve => { resolveSearch = resolve; })) };
      const app = createApp({ document, geocoding, navigator: {} });
      const input = document.querySelector('#start-input');
      input.value = '검색';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      resolveSearch([{ label: '취소된 결과', lat: 37.4, lng: 127.1 }]);
      await Promise.resolve();

      expect(document.querySelector('#start-results').textContent).toBe('');
      app.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('새 지도 지점 선택 후 늦게 도착한 주소 검색 결과를 표시하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      let resolveSearch;
      const geocoding = { searchPlaces: vi.fn(() => new Promise(resolve => { resolveSearch = resolve; })) };
      const app = createApp({ document, geocoding, navigator: {} });
      const input = document.querySelector('#start-input');

      input.value = '주소 검색';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      app.setPoint('start', { label: '현재 위치', lat: 37.5, lng: 127.1 });
      resolveSearch([{ label: '오래된 검색 결과', lat: 37.4, lng: 127.0 }]);
      await Promise.resolve();

      expect(document.querySelector('#start-results').textContent).toBe('');
      expect(input.value).toBe('현재 위치');
      app.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('오래된 주소 검색 응답은 최신 검색 결과를 덮어쓰지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const pending = [];
      const geocoding = { searchPlaces: vi.fn(() => new Promise(resolve => pending.push(resolve))) };
      const app = createApp({ document, geocoding, navigator: {} });
      const input = document.querySelector('#start-input');

      input.value = '첫 검색';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      input.value = '최신 검색';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);

      pending[1]([{ label: '최신 결과', lat: 37.5, lng: 127.1 }]);
      await Promise.resolve();
      pending[0]([{ label: '오래된 결과', lat: 37.4, lng: 127.0 }]);
      await Promise.resolve();

      expect(document.querySelector('#start-results').textContent).toContain('최신 결과');
      expect(document.querySelector('#start-results').textContent).not.toContain('오래된 결과');
      app.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('허용되지 않은 경로 모드는 안전한 제목으로 표시한다', async () => {
    const feature = { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } };
    const map = { setRoutes: vi.fn() };
    const routing = { getRoutes: vi.fn().mockResolvedValue([{ mode: '<img src=x onerror=alert(1)>', feature }]) };
    const app = createApp({ document, map, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });
    document.querySelector('#route-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.querySelector('[data-route-mode]')).not.toBeNull());
    expect(document.querySelector('#route-list img')).toBeNull();
    expect(document.querySelector('[data-route-mode]').textContent).toContain('A 경로');
    expect(map.setRoutes.mock.calls[0][0][0].mode).toBe('A');
    app.destroy();
    app.destroy();
  });

  it('현재 위치 요청에 timeout 옵션을 전달하고 잘못된 좌표를 거부한다', () => {
    const getCurrentPosition = vi.fn();
    const reversePlace = vi.fn();
    const app = createApp({
      document,
      geocoding: { reversePlace },
      navigator: { geolocation: { getCurrentPosition } }
    });

    document.querySelector('#use-location').click();
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 10000
    });
    getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 91, longitude: 127 } });

    expect(reversePlace).not.toHaveBeenCalled();
    expect(document.querySelector('#status').textContent).toContain('확인할 수 없습니다');
    app.destroy();
  });

  it('현재 위치 역지오코딩 응답은 destroy 이후 상태를 변경하지 않는다', async () => {
    let resolveReverse;
    const reversePlace = vi.fn(() => new Promise(resolve => { resolveReverse = resolve; }));
    const getCurrentPosition = vi.fn();
    const map = { setPoint: vi.fn() };
    const app = createApp({ document, map, geocoding: { reversePlace }, navigator: { geolocation: { getCurrentPosition } } });

    document.querySelector('#use-location').click();
    getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 37.5, longitude: 127.1 } });
    await Promise.resolve();
    app.destroy();
    resolveReverse({ label: '삭제 후 위치', lat: 37.5, lng: 127.1 });
    await Promise.resolve();

    expect(map.setPoint).not.toHaveBeenCalled();
    expect(document.querySelector('#start-input').value).toBe('');
  });

  it('경로 검색 실패 후 다시 시도할 수 있고 검색 중 제출을 잠근다', async () => {
    let rejectFirst;
    const feature = { properties: { 'track-length': '1000', messages: [] }, geometry: { type: 'LineString', coordinates: [] } };
    const routing = {
      getRoutes: vi.fn()
        .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
        .mockResolvedValueOnce([{ mode: 'A', feature }])
    };
    const map = { setPoint: vi.fn(), setRoutes: vi.fn(), selectRoute: vi.fn() };
    const app = createApp({ document, map, routing, geocoding: {}, navigator: {} });
    app.setPoint('start', { label: '출발', lat: 37.4, lng: 127.1 });
    app.setPoint('end', { label: '도착', lat: 37.5, lng: 127.2 });

    document.querySelector('#route-form').requestSubmit();
    expect(document.querySelector('#route-form button[type="submit"]').disabled).toBe(true);
    rejectFirst(new Error('일시적인 오류'));
    await vi.waitFor(() => expect(document.querySelector('#retry').hidden).toBe(false));
    expect(document.querySelector('#route-form button[type="submit"]').disabled).toBe(false);

    document.querySelector('#retry').click();
    await vi.waitFor(() => expect(routing.getRoutes).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-route-mode]')).toHaveLength(1));
    expect(document.querySelector('#retry').hidden).toBe(true);
    app.destroy();
  });

  it('오프라인 전환을 상태 영역에 안내하고 destroy 후에는 갱신하지 않는다', () => {
    const app = createApp({ document, geocoding: {}, navigator: {} });
    const view = document.defaultView;

    view.dispatchEvent(new Event('offline'));
    expect(document.querySelector('#status').textContent).toBe('인터넷 연결이 끊겼습니다. 연결 후 다시 시도해주세요.');

    app.destroy();
    document.querySelector('#status').textContent = '정리됨';
    view.dispatchEvent(new Event('offline'));
    expect(document.querySelector('#status').textContent).toBe('정리됨');
  });
});
