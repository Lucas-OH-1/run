import { describe, expect, it, vi } from 'vitest';
import { reversePlace, searchPlaces } from '../src/services/geocoding.js';

const feature = {
  geometry: { coordinates: [127.14246, 37.48913] },
  properties: { name: '밀파니 타워', street: '위례서로', housenumber: '273', city: '서울특별시' }
};

describe('Photon client', () => {
  it('검색 결과를 앱 좌표 형식으로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
    await expect(searchPlaces('밀파니 타워', fetchImpl)).resolves.toEqual([
      { label: '밀파니 타워, 위례서로 273, 서울특별시', lat: 37.48913, lng: 127.14246 }
    ]);
  });

  it('역지오코딩 결과가 없으면 좌표 라벨을 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });
    await expect(reversePlace({ lat: 37.5, lng: 127.1 }, fetchImpl)).resolves.toEqual({
      label: '37.50000, 127.10000', lat: 37.5, lng: 127.1
    });
  });

  it('HTTP 오류를 일관된 오류로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(searchPlaces('서울', fetchImpl)).rejects.toThrow('주소 검색 서비스를 사용할 수 없습니다.');
  });
});
