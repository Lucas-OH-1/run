import { describe, expect, it, vi } from 'vitest';
import { createRoutingClient } from '../src/services/routing.js';

const SERVICE_ERROR = '러닝 경로 서비스를 사용할 수 없습니다.';
const ROUTE_ERROR = '러닝 경로를 찾지 못했습니다. 지점을 조금 옮겨 다시 시도해주세요.';
const start = { lat: 37.44, lng: 127.12 };
const end = { lat: 37.48, lng: 127.14 };
const feature = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [] }
};
const ok = body => ({ ok: true, json: async () => body });
const routeResponse = () => ok({ type: 'FeatureCollection', features: [feature] });
const profileResponse = profileid => ok({ profileid });

const isProfileUpload = ([, options]) => options?.method === 'POST';
const profileUploadCount = fetchImpl => fetchImpl.mock.calls.filter(isProfileUpload).length;
const routeRequestCount = fetchImpl => fetchImpl.mock.calls.filter(call => !isProfileUpload(call)).length;

async function expectRouteError(fetchImpl) {
  const client = createRoutingClient({ fetchImpl });
  await expect(client.getRoutes(start, end)).rejects.toThrow(ROUTE_ERROR);
}

describe('routing client', () => {
  it('동시 요청에서도 모드별 프로필을 한 번만 등록하고 캐시를 재사용한다', async () => {
    let profileUploads = 0;
    const fetchImpl = vi.fn((input, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve(profileResponse(`profile_${profileUploads++}`));
      }
      return Promise.resolve(routeResponse());
    });
    const client = createRoutingClient({ fetchImpl });

    await Promise.all([client.getRoutes(start, end), client.getRoutes(start, end)]);
    await client.getRoutes(start, end);

    expect(profileUploadCount(fetchImpl)).toBe(3);
    expect(routeRequestCount(fetchImpl)).toBe(9);
  });

  it('HTTP 오류를 한 번 재시도하며 프로필을 다시 등록한다', async () => {
    let profileUploads = 0;
    let firstRouteFailed = false;
    const fetchImpl = vi.fn((input, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve(profileResponse(`profile_${profileUploads++}`));
      }
      const url = String(input);
      if (url.includes('profile=profile_0') && !firstRouteFailed) {
        firstRouteFailed = true;
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve(routeResponse());
    });

    const client = createRoutingClient({ fetchImpl });
    await client.getRoutes(start, end);

    expect(profileUploadCount(fetchImpl)).toBe(4);
    expect(routeRequestCount(fetchImpl)).toBe(4);
  });

  it('재시도 후에도 HTTP 오류가 나면 재시도를 중단한다', async () => {
    let profileUploads = 0;
    const fetchImpl = vi.fn((input, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve(profileResponse(`profile_${profileUploads++}`));
      }
      const url = String(input);
      if (url.includes('profile=profile_0') || url.includes('profile=profile_3')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve(routeResponse());
    });

    await expectRouteError(fetchImpl);

    expect(profileUploadCount(fetchImpl)).toBe(4);
    expect(routeRequestCount(fetchImpl)).toBe(4);
  });

  it('재등록 실패 시 서비스 오류를 유지한다', async () => {
    let profileUploads = 0;
    const fetchImpl = vi.fn((input, options) => {
      if (options?.method === 'POST') {
        profileUploads += 1;
        return Promise.resolve(profileUploads <= 3
          ? profileResponse(`profile_${profileUploads - 1}`)
          : ok({ error: 'profile rejected' }));
      }
      if (String(input).includes('profile=profile_0')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve(routeResponse());
    });

    const client = createRoutingClient({ fetchImpl });
    await expect(client.getRoutes(start, end)).rejects.toThrow(SERVICE_ERROR);
  });

  it.each([
    ['JSON 파싱', { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }],
    ['features가 배열이 아닌 응답', ok({ features: 'not an array' })],
    ['Feature가 아닌 객체 응답', ok({ features: [{}] })],
    ['geometry coordinates가 배열이 아닌 응답', ok({ features: [{ type: 'Feature', geometry: { coordinates: 'not an array' } }] })]
  ])('%s를 경로 오류로 처리한다', async (_, invalidResponse) => {
    let profileUploads = 0;
    const fetchImpl = vi.fn((input, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve(profileResponse(`profile_${profileUploads++}`));
      }
      return String(input).includes('profile=profile_0')
        ? Promise.resolve(invalidResponse)
        : Promise.resolve(routeResponse());
    });

    await expectRouteError(fetchImpl);
  });

  it('경로 요청 네트워크 오류를 경로 오류로 처리한다', async () => {
    let profileUploads = 0;
    const fetchImpl = vi.fn((input, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve(profileResponse(`profile_${profileUploads++}`));
      }
      if (String(input).includes('profile=profile_0')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(routeResponse());
    });

    await expectRouteError(fetchImpl);
  });
});
