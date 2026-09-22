import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

beforeEach(() => {
  document.body.innerHTML = `
<form id="route-form"><input id="start-input"><ul id="start-results"></ul><input id="end-input"><ul id="end-results"></ul><button type="submit">검색</button></form>
<button id="use-location"></button><button id="pick-start"></button><button id="pick-end"></button><button id="fit-routes"></button>
<p id="status" aria-live="polite"></p><button id="retry" hidden></button><section id="route-list"></section>`;
});

describe('createApp', () => {
  it('초기 안내를 표시한다', () => {
    createApp({ document });
    expect(document.querySelector('#status').textContent).toBe('출발지와 도착지를 선택해주세요.');
  });
});
