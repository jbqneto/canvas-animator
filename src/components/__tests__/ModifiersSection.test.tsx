// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModifiersSection } from '../ModifiersSection';
import { I18nProvider } from '../../i18n';
import type { Animated } from '../../types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const baseObj: Animated = {
  startFrame: 0, durationFrames: 100,
  base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  tracks: {}, smoothPath: false, orientToPath: false,
};

let root: Root;
let container: HTMLDivElement;
function render(obj: Animated, onChange = vi.fn()) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<I18nProvider><ModifiersSection obj={obj} onChange={onChange} /></I18nProvider>));
  return onChange;
}
const q = (sel: string) => container.querySelector(sel) as HTMLInputElement | HTMLSelectElement;
function setInput(sel: string, value: string) {
  const el = q(sel); expect(el).not.toBeNull();
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}

afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });

describe('ModifiersSection', () => {
  it('shows a row per transform property, closed when nothing is set', () => {
    render(baseObj);
    ['position', 'scale', 'rotation', 'opacity'].forEach((p) => expect(q(`[data-mod-prop="${p}"]`)).not.toBeNull());
    expect((q('[data-mod-section]') as unknown as HTMLDetailsElement).open).toBe(false);
  });
  it('starts open when the object already has a modifier', () => {
    render({ ...baseObj, modifiers: { scale: { loop: 'cycle' } } });
    expect((q('[data-mod-section]') as unknown as HTMLDetailsElement).open).toBe(true);
    expect(q('[data-mod-loop="scale"]').value).toBe('cycle');
  });
  it('sets a loop mode', () => {
    const onChange = render(baseObj);
    setInput('[data-mod-loop="rotation"]', 'pingpong');
    expect(onChange.mock.calls[0][0].modifiers).toEqual({ rotation: { loop: 'pingpong' } });
  });
  it('sets a shake with the default period, clamps it, and removes the modifier when emptied', () => {
    const onChange = render(baseObj);
    setInput('[data-mod-amount="opacity"]', '5');
    expect(onChange.mock.calls[0][0].modifiers).toEqual({ opacity: { shake: { amount: 1, periodFrames: 4 } } });
    act(() => root.unmount()); container.remove();
    const again = render({ ...baseObj, modifiers: { opacity: { shake: { amount: 0.5, periodFrames: 4 } } } });
    setInput('[data-mod-amount="opacity"]', '0');
    expect('modifiers' in again.mock.calls[0][0]).toBe(false);
  });
  it('ignores an empty or invalid number', () => {
    const onChange = render({ ...baseObj, modifiers: { position: { shake: { amount: 4, periodFrames: 4 } } } });
    setInput('[data-mod-amount="position"]', '');
    expect(onChange).not.toHaveBeenCalled();
  });
});
