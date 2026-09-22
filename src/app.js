export function createApp({ document }) {
  const status = document.querySelector('#status');
  status.textContent = '출발지와 도착지를 선택해주세요.';

  return { destroy() {} };
}
