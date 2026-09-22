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
