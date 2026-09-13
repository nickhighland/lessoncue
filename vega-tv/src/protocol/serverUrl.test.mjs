import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLessonCueServerUrl, isTrustedLocalHttpHost } from './serverUrl.ts';

test('a bare address becomes an http origin', () => {
  assert.equal(normalizeLessonCueServerUrl("192.168.4.138"), "http://192.168.4.138");
  assert.equal(normalizeLessonCueServerUrl("lessoncue.local"), "http://lessoncue.local");
});

test('default ports are dropped, others kept', () => {
  assert.equal(normalizeLessonCueServerUrl("http://10.0.0.5:80"), "http://10.0.0.5");
  assert.equal(normalizeLessonCueServerUrl("https://school.example.org:443"), "https://school.example.org");
  assert.equal(normalizeLessonCueServerUrl("http://10.0.0.5:5000"), "http://10.0.0.5:5000");
});

test('plain HTTP is refused for anywhere that is not local', () => {
  // The rule that keeps a device token off the open internet.
  assert.throws(() => normalizeLessonCueServerUrl("http://example.org"), /HTTPS/);
  assert.throws(() => normalizeLessonCueServerUrl("http://8.8.8.8"), /HTTPS/);
  assert.doesNotThrow(() => normalizeLessonCueServerUrl("https://example.org"));
});

test('every private range is allowed over HTTP, and no more', () => {
  for (const host of ["10.1.2.3", "127.0.0.1", "169.254.1.1", "172.16.0.1", "172.31.255.255",
                      "192.168.1.1", "localhost", "tv.local"]) {
    assert.equal(isTrustedLocalHttpHost(host), true, host);
  }
  // 172.15 and 172.32 sit outside the private block; 11.x is public.
  for (const host of ["172.15.0.1", "172.32.0.1", "11.0.0.1", "8.8.8.8", "example.org"]) {
    assert.equal(isTrustedLocalHttpHost(host), false, host);
  }
});

test('IPv6 loopback, unique local and link local are trusted', () => {
  assert.equal(isTrustedLocalHttpHost("::1"), true);
  assert.equal(isTrustedLocalHttpHost("[::1]"), true);
  assert.equal(isTrustedLocalHttpHost("fd00::1"), true);
  assert.equal(isTrustedLocalHttpHost("fe80::1%eth0"), true);
});

test('a public IPv6 address is not trusted over HTTP', () => {
  // Treating anything with a colon as local would have let this through.
  assert.equal(isTrustedLocalHttpHost("2606:4700:4700::1111"), false);
  assert.throws(() => normalizeLessonCueServerUrl("http://[2606:4700:4700::1111]"), /HTTPS/);
});

test('nonsense that merely contains colons is not an address', () => {
  assert.equal(isTrustedLocalHttpHost("not:an:address"), false);
  assert.equal(isTrustedLocalHttpHost("fe80::1::2"), false);
});

test('credentials, paths, queries and fragments are refused', () => {
  for (const bad of ["http://user:pw@10.0.0.1", "http://10.0.0.1/path", "http://10.0.0.1?q=1", "http://10.0.0.1#x"]) {
    assert.throws(() => normalizeLessonCueServerUrl(bad), /origin|valid/);
  }
});

test('an empty address says so rather than throwing something unreadable', () => {
  assert.throws(() => normalizeLessonCueServerUrl("   "), /Enter the LessonCue server address/);
});
