// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActorInspector } from '../ActorInspector';
import { I18nProvider } from '../../i18n';
import type { ActorOverlay, ShapeStyle } from '../../types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const shapeBase: ShapeStyle = { type: 'rect', fill: '#ff0000', stroke: '#ffffff', strokeWidth: 4, radius: 0 };
const makeActor = (shape: ShapeStyle): ActorOverlay => ({
  id: 'a1', name: 'Box', kind: 'shape', src: '', shape, width: 100, height: 100, flipX: false,
  startFrame: 0, durationFrames: 100,
  base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  tracks: {}, smoothPath: false, orientToPath: false,
});

let root: Root;
let container: HTMLDivElement;
function render(shape: ShapeStyle, onChange = vi.fn()) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(
    <I18nProvider>
      <ActorInspector actor={makeActor(shape)} currentFrame={1} totalFrames={100} fps={30} onChange={onChange}
        onDelete={vi.fn()} onJumpToFrame={vi.fn()} paths={[]} onAttachToPath={vi.fn()} onSelectPath={vi.fn()} />
    </I18nProvider>,
  ));
  return onChange;
}
const field = () => container.querySelector('[data-shape-field="drawFrames"]') as HTMLInputElement;
function change(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(field(), value); field().dispatchEvent(new Event('input', { bubbles: true })); });
}

afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });

describe('ShapePanel draw-on field', () => {
  it('shows the frames input for an outlined shape', () => {
    render(shapeBase);
    expect(field()).not.toBeNull();
    expect(field().disabled).toBe(false);
  });

  it('sets shape.draw when typing a positive number, in one onChange', () => {
    const onChange = render(shapeBase);
    change('24');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].shape.draw).toEqual({ frames: 24 });
  });

  it.each(['0', '', '-5', 'abc'])('removes the draw key for %j', (value) => {
    const onChange = render({ ...shapeBase, draw: { frames: 10 } });
    change(value);
    const shape = onChange.mock.calls.at(-1)![0].shape;
    expect('draw' in shape).toBe(false);
  });

  it('is disabled with no outline on a non-line shape', () => {
    render({ ...shapeBase, strokeWidth: 0 });
    expect(field().disabled).toBe(true);
  });

  it('stays enabled for a line', () => {
    render({ ...shapeBase, type: 'line', strokeWidth: 1 });
    expect(field().disabled).toBe(false);
  });
});
