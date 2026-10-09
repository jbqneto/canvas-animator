import { describe, expect, it } from 'vitest';
import { createCanvasStub } from '../canvasStub';

describe('createCanvasStub', () => {
  it('records method calls and property sets in order', () => {
    const { ctx, calls, props } = createCanvasStub();
    ctx.save();
    ctx.font = '12px serif';
    ctx.translate(1, 2);
    expect(calls).toEqual([
      { name: 'save', args: [] },
      { name: 'set:font', args: ['12px serif'] },
      { name: 'translate', args: [1, 2] },
    ]);
    expect(props.font).toBe('12px serif');
  });
  it('supports compound assignment on globalAlpha', () => {
    const { ctx } = createCanvasStub();
    ctx.globalAlpha *= 0.5;
    expect(ctx.globalAlpha).toBe(0.5);
  });
});
