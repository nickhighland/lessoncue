/**
 * The Fire TV review demo is deliberately a local-only path. The address is
 * a marker understood by this app, not a hostname that should ever be
 * resolved or sent a request.
 */
export const DEMO_SERVER_URL = 'http://lsnq.demo';
export const DEMO_PASSWORD = '123456';
export const DEMO_PAGE_URL = 'file:///pkg/assets/lessoncue-demo.html';

export function isDemoServerUrl(value: string): boolean {
  return value.trim().replace(/\/+$/, '').toLowerCase() === DEMO_SERVER_URL;
}

export function isDemoPassword(value: string): boolean {
  return value === DEMO_PASSWORD;
}
