import { describe, expect, it } from 'vitest';
import { routeStyle } from '../src/map/create-map.js';

describe('routeStyle', () => {
  it('선택 경로를 굵고 불투명하게 만든다', () => {
    expect(routeStyle('A', 'A')).toMatchObject({ color: '#087f5b', weight: 8, opacity: 1 });
    expect(routeStyle('B', 'A')).toMatchObject({ weight: 4, opacity: 0.28 });
  });
});
