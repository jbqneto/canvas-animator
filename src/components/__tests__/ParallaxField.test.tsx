// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParallaxField } from '../ParallaxField';
import { I18nProvider } from '../../i18n';
import type { Animated } from '../../types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const obj: Animated = {
  startFrame: 0, durationFrames: 100, base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  tracks: {}, smoothPath: false, orientToPath: false,
};
let root: Root;
let container: HTMLDivElement;
function render(o: Animated, onChange = vi.fn()) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<I18nProvider><ParallaxField obj={o} onChange={onChange} /></I18nProvider>));
  return onChange;
}
const input = () => container.querySelector('[data-parallax-input]') as HTMLInputElement;
function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(input(), value); input().dispatchEvent(new Event('input', { bubbles: true })); });
}
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

describe('ParallaxField', () => {
  it('shows 1 by default and for a broken stored value', () => {
    render(obj);
    expect(input().value).toBe('1');
    act(() => root.unmount()); container.remove();
    render({ ...obj, parallax: 'x' as never });
    expect(input().value).toBe('1');
  });
  it('stores a factor, clamped to 0..3', () => {
    const onChange = render(obj);
    type('0');
    expect(onChange.mock.calls[0][0].parallax).toBe(0);
    type('9');
    expect(onChange.mock.calls[1][0].parallax).toBe(3);
  });
  it('removes the field when set back to the default 1', () => {
    const onChange = render({ ...obj, parallax: 0.5 });
    type('1');
    expect('parallax' in onChange.mock.calls[0][0]).toBe(false);
  });
  it('ignores an empty input', () => {
    const onChange = render({ ...obj, parallax: 0.5 });
    type('');
    expect(onChange).not.toHaveBeenCalled();
  });
});
