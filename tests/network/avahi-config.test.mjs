import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const installer = readFileSync(new URL('../../installers/linux/lessoncue-update', import.meta.url), 'utf8');
const source = installer.match(/awk -v hostname="\$\{LOCAL_HOSTNAME\}" -v ipv6="\$\{LOCAL_IPV6\}" '([\s\S]*?)' \/etc\/avahi\/avahi-daemon\.conf > "\$\{AVAHI_CONFIG\}"/)?.[1];
assert.ok(source, 'protected local-address operation must contain the Avahi transform');

function render(config, enabled) {
  const result = spawnSync('awk', ['-v', 'hostname=lessoncue', '-v', `ipv6=${enabled}`, source], {
    input: config, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

for (const enabled of ['true', 'false']) {
  test(`Avahi local address ${enabled === 'true' ? 'allows' : 'suppresses'} IPv6 without changing unrelated settings`, () => {
    const original = `[server]\n#host-name=old\nuse-ipv4=yes\nuse-ipv6=yes\n[publish]\npublish-workstation=no\n#publish-aaaa-on-ipv4=yes\n[reflector]\nenable-reflector=no\n`;
    const rendered = render(original, enabled);
    const yesNo = enabled === 'true' ? 'yes' : 'no';
    assert.match(rendered, /host-name=lessoncue/);
    assert.match(rendered, new RegExp(`^use-ipv6=${yesNo}$`, 'm'));
    assert.match(rendered, new RegExp(`^publish-aaaa-on-ipv4=${yesNo}$`, 'm'));
    assert.match(rendered, /^use-ipv4=yes$/m);
    assert.match(rendered, /^enable-reflector=no$/m);
    assert.equal(rendered.match(/^use-ipv6=/gm)?.length, 1);
    assert.equal(rendered.match(/^publish-aaaa-on-ipv4=/gm)?.length, 1);
    assert.equal(render(rendered, enabled), rendered, 'reapplying the setting must be idempotent');
  });
}

test('Avahi transform creates missing server and publish sections', () => {
  const rendered = render('[reflector]\nenable-reflector=no\n', 'false');
  assert.match(rendered, /\[server\]\nhost-name=lessoncue\nuse-ipv6=no/);
  assert.match(rendered, /\[publish\]\npublish-aaaa-on-ipv4=no/);
});
