import { describe, expect, it, vi } from 'vitest';
import { findTancheonCorridor } from '../src/services/corridor.js';

const ok = body => ({ ok: true, json: async () => body });

const overpassWays = {
  elements: [
    {
      type: 'way',
      id: 1,
      nodes: [1, 2, 3],
      tags: { highway: 'cycleway', name: '탄천 자전거도로' },
      geometry: [
        { lat: 37.44, lon: 127.12 },
        { lat: 37.445, lon: 127.12 },
        { lat: 37.45, lon: 127.12 }
      ]
    },
    {
      type: 'way',
      id: 2,
      nodes: [3, 4, 5],
      tags: { highway: 'cycleway', name: '탄천 자전거도로' },
      geometry: [
        { lat: 37.45, lon: 127.12 },
        { lat: 37.455, lon: 127.121 },
        { lat: 37.46, lon: 127.122 }
      ]
    }
  ]
};

describe('Tancheon corridor service', () => {
  it('OSM node 연결망에서 출발·도착 사이의 연속된 경유점을 만든다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(overpassWays));
    const corridor = await findTancheonCorridor(
      { lat: 37.441, lng: 127.12 },
      { lat: 37.459, lng: 127.122 },
      fetchImpl
    );

    expect(corridor.waypoints[0].lat).toBeCloseTo(37.44);
    expect(corridor.waypoints.at(-1).lat).toBeCloseTo(37.46);
    expect(corridor.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('overpass-api.de/api/interpreter');
    expect(String(fetchImpl.mock.calls[0][1].body)).toContain('around:10000,37.441,127.12');
    expect(String(fetchImpl.mock.calls[0][1].body)).toContain('way["highway"="cycleway"]');
  });

  it('같은 방향에 있는 미연결 지선을 경유점에 섞지 않는다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      elements: [
        ...overpassWays.elements,
        {
          type: 'way',
          id: 3,
          nodes: [2, 6, 7],
          tags: { highway: 'cycleway', name: '탄천 자전거도로 지선' },
          geometry: [
            { lat: 37.445, lon: 127.12 },
            { lat: 37.45, lon: 127.14 },
            { lat: 37.455, lon: 127.14 }
          ]
        }
      ]
    }));

    const corridor = await findTancheonCorridor(
      { lat: 37.44, lng: 127.12 },
      { lat: 37.46, lng: 127.122 },
      fetchImpl
    );

    expect(corridor.waypoints.every(point => point.lng < 127.13)).toBe(true);
  });

  it('유효한 탄천 geometry가 없으면 안내 오류를 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ elements: [] }));
    await expect(findTancheonCorridor(
      { lat: 37.44, lng: 127.12 },
      { lat: 37.46, lng: 127.12 },
      fetchImpl
    )).rejects.toThrow('탄천자전거도로를 찾지 못했습니다.');
  });
});
