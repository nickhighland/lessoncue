import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  DEMO_PAGE_URL,
  DEMO_PASSWORD,
  DEMO_SERVER_URL,
  isDemoPassword,
  isDemoServerUrl,
} from './demoMode.ts';

test('the review address is a local demo marker', () => {
  assert.equal(isDemoServerUrl(DEMO_SERVER_URL), true);
  assert.equal(isDemoServerUrl('HTTP://LSNQ.DEMO/'), true);
  assert.equal(isDemoServerUrl('https://lsnq.demo'), false);
  assert.equal(isDemoServerUrl('http://lsnq.demo/anything'), false);
});

test('the review password is exact', () => {
  assert.equal(isDemoPassword(DEMO_PASSWORD), true);
  assert.equal(isDemoPassword('12345'), false);
  assert.equal(isDemoPassword('1234567'), false);
  assert.equal(isDemoPassword(' 123456'), false);
});

test('the demo player is packaged locally', () => {
  assert.equal(DEMO_PAGE_URL, 'file:///pkg/assets/lessoncue-demo.html');
});
