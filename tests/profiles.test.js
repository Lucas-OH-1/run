import { describe, expect, it } from 'vitest';
import { ROUTE_MODE_IDS, ROUTE_PROFILES } from '../src/routing/profiles.js';

describe('route profiles', () => {
  it('A는 보행로를 자전거도로와 계단보다 우선한다', () => {
    expect(ROUTE_PROFILES.A).toContain('highway=footway|pedestrian');
    expect(ROUTE_PROFILES.A).toContain('highway=cycleway then 4');
    expect(ROUTE_PROFILES.A).toContain('highway=steps then 10000');
  });
  it('새 경로 전략은 탄천 필수, 안전, 최단거리, 혼합 순서로 정의된다', () => {
    expect(ROUTE_MODE_IDS).toEqual(['RIVER', 'SAFE', 'SHORT', 'MIXED']);
    expect(ROUTE_MODE_IDS.every(mode => typeof ROUTE_PROFILES[mode] === 'string')).toBe(true);
    expect(ROUTE_PROFILES.RIVER).toContain('highway=cycleway then 1.4');
    expect(ROUTE_PROFILES.SAFE).toContain('highway=primary|primary_link|trunk|trunk_link then 120');
    expect(ROUTE_PROFILES.SHORT).toContain('else 1');
  });
  it('모든 프로필이 보행 금지 길을 차단한다', () => {
    Object.values(ROUTE_PROFILES).forEach(profile => expect(profile).toContain('assign accesspenalty switch footaccess 0 100000'));
  });
});
