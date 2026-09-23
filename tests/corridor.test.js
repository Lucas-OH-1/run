import { describe, expect, it, vi } from 'vitest';
import { findTancheonCorridor } from '../src/services/corridor.js';

const ok = body => ({ ok: true, json: async () => body });

const overpassWays = {
  elements: [
    {
      type: 'way',
      id: 1,
      geometry: [
        { lat: 37.44, lon: 127.12 },
        { lat: 37.445, lon: 127.12 },
        { lat: 37.45, lon: 127.12 }
      ]
    },
    {
      type: 'way',
      id: 2,
      geometry: [
        { lat: 37.45, lon: 127.12 },
        { lat: 37.455, lon: 127.121 },
        { lat: 37.46, lon: 127.122 }
      ]
    }
  ]
};

describe('Tancheon corridor service', () => {
  it('Overpass geometry에서 출발·도착 사이의 순서 있는 경유점을 만든다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(overpassWays));
    const corridor = await findTancheonCorridor(
      { lat: 37.441, lng: 127.12 },
      { lat: 37.459, lng: 127.122 },
      fetchImpl
    );

    expect(corridor.waypoints[0].lat).toBeCloseTo(37.44);
    expect(corridor.waypoints.at(-1).lat).toBeCloseTo(37.46);
    expect(corridor.waypoints.length).toBeGreaterThan(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('overpass-api.de/api/interpreter');
    expect(String(fetchImpl.mock.calls[0][1].body)).toContain('around:10000,37.441,127.12');
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
