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
