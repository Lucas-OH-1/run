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
