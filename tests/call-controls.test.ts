import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMediaButton } from '../src/call-controls.ts';

test('media symbols expose the next action and a visible off state in either mode', () => {
  for (const kind of ['microphone', 'camera'] as const) for (const off of [false, true]) {
    const attributes = new Map<string, string>();
    const button = { title: '', innerHTML: '', dataset: {} as Record<string, string>, setAttribute: (key: string, value: string) => attributes.set(key, value) };
    renderMediaButton(button as unknown as HTMLButtonElement, kind, off);
    const label = kind === 'microphone' ? off ? 'Unmute microphone' : 'Mute microphone' : off ? 'Turn camera on' : 'Turn camera off';
    assert.equal(button.title, label);
    assert.equal(attributes.get('aria-label'), label);
    assert.equal(attributes.get('aria-pressed'), String(off));
    assert.equal(button.dataset.off, String(off));
    assert.match(button.innerHTML, /<svg[^>]+aria-hidden="true"/);
    assert.equal(button.innerHTML.includes('data-slash'), off);
    assert.equal(button.innerHTML.includes(label), false, 'The visible control contains only a symbol');
    const original = button.innerHTML;
    renderMediaButton(button as unknown as HTMLButtonElement, kind, off);
    assert.equal(button.innerHTML, original);
  }
});
