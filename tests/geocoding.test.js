import { describe, expect, it, vi } from 'vitest';
import { reversePlace, searchPlaces } from '../src/services/geocoding.js';

const feature = {
  geometry: { coordinates: [127.14246, 37.48913] },
  properties: { name: '밀파니 타워', street: '위례서로', housenumber: '273', city: '서울특별시' }
};

const serviceError = '주소 검색 서비스를 사용할 수 없습니다.';

const okResponse = (body) => ({ ok: true, json: async () => body });

describe('Photon client', () => {
  it('검색 결과를 앱 좌표 형식으로 바꾸고 정확한 URL을 요청한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ features: [feature] }));

    await expect(searchPlaces('  밀파니 타워  ', fetchImpl)).resolves.toEqual([
      { label: '밀파니 타워, 위례서로 273, 서울특별시', lat: 37.48913, lng: 127.14246 }
    ]);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://photon.komoot.io/api/?q=%EB%B0%80%ED%8C%8C%EB%8B%88+%ED%83%80%EC%9B%8C&limit=5'
    );
  });

  it('두 글자 미만으로 다듬은 검색어는 요청하지 않는다', async () => {
    const fetchImpl = vi.fn();

    await expect(searchPlaces('  가  ', fetchImpl)).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('검색 결과에서 좌표가 없는 feature를 건너뛴다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ features: [
      {},
      { geometry: {} },
      { geometry: { coordinates: [127.1] } },
      { geometry: { coordinates: ['127.1', 37.5] } },
      { geometry: { coordinates: [127.2, 37.6] }, properties: { name: '유효한 장소' } }
    ] }));

    await expect(searchPlaces('장소', fetchImpl)).resolves.toEqual([
      { label: '유효한 장소', lat: 37.6, lng: 127.2 }
    ]);
  });

  it('properties가 비어 있으면 좌표를 라벨로 사용한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({
      features: [{ geometry: { coordinates: [127.2, 37.6] }, properties: {} }]
    }));

    await expect(searchPlaces('장소', fetchImpl)).resolves.toEqual([
      { label: '37.60000, 127.20000', lat: 37.6, lng: 127.2 }
    ]);
  });

  it('역지오코딩 결과가 없거나 malformed feature면 요청 좌표를 반환한다', async () => {
    const point = { lat: 37.5, lng: 127.1 };
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ features: [{ geometry: { coordinates: ['bad', 37.5] } }] }));

    await expect(reversePlace(point, fetchImpl)).resolves.toEqual({
      label: '37.50000, 127.10000', lat: 37.5, lng: 127.1
    });
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://photon.komoot.io/reverse?lat=37.5&lon=127.1'
    );
  });

  it('빈 properties인 역지오코딩 결과는 좌표 라벨을 사용한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({
      features: [{ geometry: { coordinates: [127.1, 37.5] }, properties: {} }]
    }));

    await expect(reversePlace({ lat: 37.5, lng: 127.1 }, fetchImpl)).resolves.toEqual({
      label: '37.50000, 127.10000', lat: 37.5, lng: 127.1
    });
  });

  it('malformed 또는 빈 feature 배열은 검색 결과를 비우고 역지오코딩은 좌표를 반환한다', async () => {
    const emptySearchFetch = vi.fn().mockResolvedValue(okResponse({ features: [] }));
    const malformedSearchFetch = vi.fn().mockResolvedValue(okResponse({ features: null }));
    const reverseFetch = vi.fn().mockResolvedValue(okResponse({ features: 'invalid' }));

    await expect(searchPlaces('장소', emptySearchFetch)).resolves.toEqual([]);
    await expect(searchPlaces('장소', malformedSearchFetch)).resolves.toEqual([]);
    await expect(reversePlace({ lat: 37.5, lng: 127.1 }, reverseFetch)).resolves.toEqual({
      label: '37.50000, 127.10000', lat: 37.5, lng: 127.1
    });
  });

  it('HTTP 오류를 일관된 오류로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(searchPlaces('서울', fetchImpl)).rejects.toThrow(serviceError);
  });

  it('null 또는 malformed JSON 응답을 일관된 오류로 바꾼다', async () => {
    const nullFetch = vi.fn().mockResolvedValue(okResponse(null));
    const malformedFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('bad json'); } });

    await expect(searchPlaces('서울', nullFetch)).rejects.toEqual(new Error(serviceError));
    await expect(searchPlaces('서울', malformedFetch)).rejects.toEqual(new Error(serviceError));
  });

  it('네트워크 오류를 일관된 오류로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network failed'));

    await expect(searchPlaces('서울', fetchImpl)).rejects.toEqual(new Error(serviceError));
  });
});
