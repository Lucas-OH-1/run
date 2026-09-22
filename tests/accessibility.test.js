import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('page accessibility', () => {
  it('지도와 상태, 검색 목록에 접근 가능한 이름을 제공한다', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    expect(html).toContain('aria-label="러닝 경로 지도"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="listbox"');
  });

  it('지도 동작과 안전 안내를 모바일 패널에서 제공한다', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    expect(html).toContain('class="map-actions"');
    expect(html).toContain('class="safety"');
    expect(html).toContain('지도와 실제 공사·침수·통제 상태가 다를 수 있으니 현장을 확인하세요.');
  });
});
