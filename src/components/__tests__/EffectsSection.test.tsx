// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectsSection } from '../EffectsSection';
import { I18nProvider, t } from '../../i18n';
import type { Animated } from '../../types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const filterSupported = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../utils/effectsRender', async (orig) => ({
  ...(await orig<typeof import('../../utils/effectsRender')>()),
  canvasFilterSupported: filterSupported,
}));

const baseObj: Animated = {
  startFrame: 0, durationFrames: 100,
  base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  tracks: {}, smoothPath: false, orientToPath: false,
};

let root: Root;
let container: HTMLDivElement;
function render(obj: Animated, frame: number, onChange = vi.fn()) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<I18nProvider><EffectsSection obj={obj} currentFrame={frame} onChange={onChange} /></I18nProvider>));
  return onChange;
}
const q = (sel: string) => container.querySelector(sel) as HTMLInputElement | HTMLButtonElement;
function click(sel: string) {
  const el = q(sel); expect(el).not.toBeNull();
  act(() => { el.click(); });
}
function change(sel: string, value: string) {
  const el = q(sel) as HTMLInputElement; expect(el).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}

afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); filterSupported.mockReturnValue(true); });

describe('EffectsSection', () => {
  it('renders the four groups', () => {
    render(baseObj, 1);
    ['shadow', 'glow', 'blur', 'tint'].forEach((g) => expect(q(`[data-fx-toggle="${g}"]`)).not.toBeNull());
  });

  it('turns an effect on with its quick button, writing to effects (stopwatch off)', () => {
    const onChange = render(baseObj, 1);
    click('[data-fx-toggle="shadow"]');
    const [next] = onChange.mock.calls[0];
    expect(next.effects.shadowOpacity).toBe(0.6);
    expect(next.tracks.shadowOpacity).toBeUndefined();
  });

  it('turns an active effect off with the same button', () => {
    const obj = { ...baseObj, effects: { shadowOpacity: 0.6, shadowBlur: 8, shadowX: 0, shadowY: 4, shadowColor: '#000000',
      glowRadius: 0, glowStrength: 1, glowColor: '#ffffff', blur: 0, tintAmount: 0, tintColor: '#ff0000' } };
    const onChange = render(obj, 1);
    click('[data-fx-toggle="shadow"]');
    expect(onChange.mock.calls[0][0].effects.shadowOpacity).toBe(0);
  });

  it('with the stopwatch on, editing a value creates a key at the frame', () => {
    const obj: Animated = { ...baseObj, tracks: { blur: [{ frame: 1, value: 0 }] } };
    const onChange = render(obj, 10);
    change('[data-fx-input="blur"]', '9');
    const [next, description] = onChange.mock.calls[0];
    expect(next.tracks.blur).toContainEqual(expect.objectContaining({ frame: 10, value: 9 }));
    expect(next.tracks.blur).toContainEqual(expect.objectContaining({ frame: 1, value: 0 }));
    expect(description).toBe(t('actor.history.key', { label: t('fx.prop.blur'), frame: 10 }));
  });

  it('with the stopwatch off, editing a value changes the static effect', () => {
    const onChange = render(baseObj, 10);
    change('[data-fx-input="blur"]', '9');
    const [next, description] = onChange.mock.calls[0];
    expect(next.effects.blur).toBe(9);
    expect(next.tracks.blur).toBeUndefined();
    expect(description).toBe(t('actor.history.change', { label: t('fx.prop.blur') }));
  });

  it('the stopwatch creates the first key; the diamond adds and removes keys', () => {
    let onChange = render(baseObj, 5);
    click('[data-fx-stopwatch="blur"]');
    expect(onChange.mock.calls[0][0].tracks.blur).toEqual([expect.objectContaining({ frame: 5, value: 0 })]);
    act(() => root.unmount()); container.remove();

    const animated: Animated = { ...baseObj, tracks: { blur: [{ frame: 1, value: 0 }] } };
    onChange = render(animated, 5);
    click('[data-fx-key="blur"]');
    expect(onChange.mock.calls[0][0].tracks.blur).toHaveLength(2);
    act(() => root.unmount()); container.remove();

    onChange = render(animated, 1);
    click('[data-fx-key="blur"]');
    expect(onChange.mock.calls[0][0].tracks.blur).toHaveLength(0);
  });

  it('changing a color edits effects only, never tracks', () => {
    const obj: Animated = { ...baseObj, tracks: { shadowOpacity: [{ frame: 1, value: 0.5 }] } };
    const onChange = render(obj, 3);
    change('[data-fx-color="shadowColor"]', '#ff0000');
    const [next, description] = onChange.mock.calls[0];
    expect(next.effects.shadowColor).toBe('#ff0000');
    expect(next.tracks).toBe(obj.tracks);
    expect(description).toBe(t('fx.history.color'));
  });

  it('shows the blur hint only when the canvas filter is unsupported', () => {
    render(baseObj, 1);
    expect(container.textContent).not.toContain(t('fx.blurUnsupported'));
    act(() => root.unmount()); container.remove();
    filterSupported.mockReturnValue(false);
    render(baseObj, 1);
    expect(container.textContent).toContain(t('fx.blurUnsupported'));
  });
});
