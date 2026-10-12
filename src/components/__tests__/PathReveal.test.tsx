// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PathInspector } from '../PathInspector';
import { I18nProvider } from '../../i18n';
import type { MotionPath } from '../../types';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const makePath = (reveal: MotionPath['style']['reveal'], drawFrames?: number): MotionPath => ({
  id: 'p1', name: 'Path', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], smooth: false, closed: false,
  style: { visible: true, color: '#ffffff', width: 3, stroke: 'solid', reveal, ...(drawFrames === undefined ? {} : { drawFrames }) },
  startFrame: 1, durationFrames: 60,
});

let root: Root;
let container: HTMLDivElement;
function render(path: MotionPath, onChange = vi.fn()) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(
    <I18nProvider>
      <PathInspector path={path} actors={[]} totalFrames={100} onChange={onChange} onDelete={vi.fn()}
        onAttachActor={vi.fn()} onSelectActor={vi.fn()} />
    </I18nProvider>,
  ));
  return onChange;
}
const select = () => container.querySelector('[data-path-field="reveal"]') as HTMLSelectElement;
const frames = () => container.querySelector('[data-path-field="drawFrames"]') as HTMLInputElement;

afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });

describe('PathInspector draw reveal', () => {
  it('offers the draw option and emits reveal draw', () => {
    const onChange = render(makePath('full'));
    expect(Array.from(select().options).map((o) => o.value)).toContain('draw');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    act(() => { setter.call(select(), 'draw'); select().dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange.mock.calls[0][0].style.reveal).toBe('draw');
  });

  it('hides the frames input for full and follow', () => {
    render(makePath('full'));
    expect(frames()).toBeNull();
    act(() => root.unmount()); container.remove();
    render(makePath('follow'));
    expect(frames()).toBeNull();
  });

  it('shows frames defaulting to 24 when reveal is draw and edits drawFrames', () => {
    const onChange = render(makePath('draw'));
    expect(frames().value).toBe('24');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(frames(), '40'); frames().dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].style.drawFrames).toBe(40);
  });
});
