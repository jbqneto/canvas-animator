// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaskSection } from '../MaskSection';
import { ActorInspector } from '../ActorInspector';
import { I18nProvider } from '../../i18n';
import type { ActorOverlay, Animated } from '../../types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

type Obj = Animated & { id: string };
const baseObj: Obj = {
  id: 'self', startFrame: 0, durationFrames: 100,
  base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  tracks: {}, smoothPath: false, orientToPath: false,
};
const actors = [{ id: 'm', name: 'Circle' }, { id: 'self', name: 'Me' }];

let root: Root;
let container: HTMLDivElement;
function mount(node: React.ReactNode) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<I18nProvider>{node}</I18nProvider>));
}
function render(obj: Obj, list = actors, onChange = vi.fn()) {
  mount(<MaskSection obj={obj} maskActors={list} onChange={onChange} />);
  return onChange;
}
const q = (sel: string) => container.querySelector(sel) as HTMLInputElement | HTMLSelectElement;
function pick(sel: string, value: string) {
  const el = q(sel); expect(el).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
}

afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });

describe('MaskSection', () => {
  it('lists None plus the mask actors, never the object itself', () => {
    render(baseObj);
    const values = Array.from(q('[data-mask-actor]').querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['', 'm']);
    expect((q('[data-mask-section]') as unknown as HTMLDetailsElement).open).toBe(false);
  });

  it('opens when a mask is set', () => {
    render({ ...baseObj, mask: { actorId: 'm', mode: 'inside' } });
    expect((q('[data-mask-section]') as unknown as HTMLDetailsElement).open).toBe(true);
  });

  it('choosing an actor sets mask inside, in one onChange', () => {
    const onChange = render(baseObj);
    pick('[data-mask-actor]', 'm');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].mask).toEqual({ actorId: 'm', mode: 'inside' });
  });

  it('changing the mode keeps the actor, in one onChange', () => {
    const onChange = render({ ...baseObj, mask: { actorId: 'm', mode: 'inside' } });
    pick('[data-mask-mode]', 'outside');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].mask).toEqual({ actorId: 'm', mode: 'outside' });
  });

  it('choosing None removes the mask key', () => {
    const onChange = render({ ...baseObj, mask: { actorId: 'm', mode: 'outside' } });
    pick('[data-mask-actor]', '');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect('mask' in onChange.mock.calls[0][0]).toBe(false);
  });

  it('hides the mode select while None', () => {
    render(baseObj);
    expect(q('[data-mask-mode]')).toBeNull();
  });

  it('keeps a missing actor as an option so it can be cleared', () => {
    const onChange = render({ ...baseObj, mask: { actorId: 'gone', mode: 'inside' } });
    expect(q('[data-mask-actor] option[value="gone"]')).not.toBeNull();
    expect((q('[data-mask-actor]') as HTMLSelectElement).value).toBe('gone');
    pick('[data-mask-actor]', '');
    expect('mask' in onChange.mock.calls[0][0]).toBe(false);
  });
});

describe('ActorInspector "use as mask"', () => {
  const shape = (extra: Partial<ActorOverlay> = {}, type: 'rect' | 'line' = 'rect'): ActorOverlay => ({
    id: 'a1', name: 'Box', kind: 'shape', src: '',
    shape: { type, fill: '#f00', stroke: '#fff', strokeWidth: 4, radius: 0 },
    width: 100, height: 100, flipX: false, startFrame: 0, durationFrames: 100,
    base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    tracks: {}, smoothPath: false, orientToPath: false, ...extra,
  });
  const inspect = (actor: ActorOverlay, onChange = vi.fn()) => {
    mount(<ActorInspector actor={actor} currentFrame={1} totalFrames={100} fps={30} onChange={onChange}
      onDelete={vi.fn()} onJumpToFrame={vi.fn()} paths={[]} onAttachToPath={vi.fn()} onSelectPath={vi.fn()} />);
    return onChange;
  };
  const toggle = () => { act(() => { q('[data-mask-only]').click(); }); };

  it('sets maskOnly when checked', () => {
    const onChange = inspect(shape());
    toggle();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].maskOnly).toBe(true);
  });

  it('removes the key when unchecked', () => {
    const onChange = inspect(shape({ maskOnly: true }));
    expect((q('[data-mask-only]') as HTMLInputElement).checked).toBe(true);
    toggle();
    expect('maskOnly' in onChange.mock.calls[0][0]).toBe(false);
  });

  it('is not offered for line shapes', () => {
    inspect(shape({}, 'line'));
    expect(q('[data-mask-only]')).toBeNull();
  });
});
