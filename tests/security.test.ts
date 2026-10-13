import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedIpc, isWindowMode, assetPath } from '../src/security.ts';

const expected = 'zoomtime://app/main_window/index.html';
test('only the exact app main-frame URL can invoke window commands', () => {
  assert.equal(isTrustedIpc(expected, expected, true), true);
  for (const url of ['https://example.com', `${expected}?fake=1`, 'zoomtime://attacker/main_window/index.html',
    `${expected}#lookalike`, 'zoomtime://app/main_window/index.html.evil']) {
    assert.equal(isTrustedIpc(url, expected, true), false);
  }
  assert.equal(isTrustedIpc(expected, expected, false), false);
});
test('IPC accepts only the two supported modes', () => {
  assert.equal(isWindowMode('mini'), true);
  assert.equal(isWindowMode('normal'), true);
  for (const input of [true, null, {}, 'fullScreen', ['mini']]) assert.equal(isWindowMode(input), false);
});
test('the packaged scheme serves only explicitly bundled assets', () => {
  assert.equal(assetPath(expected), 'main_window/index.html');
  assert.equal(assetPath('zoomtime://app/main_window/index.js'), 'main_window/index.js');
  assert.equal(assetPath('zoomtime://app/main_window/index.css'), 'main_window/index.css');
  for (const url of ['file:///etc/passwd', 'zoomtime://evil/main_window/index.js',
    'zoomtime://app/../../package.json', 'zoomtime://app/main_window/index.js.map',
    'zoomtime://app/main_window/index.html?file=secret', 'not-a-url']) {
    assert.equal(assetPath(url), null);
  }
});
