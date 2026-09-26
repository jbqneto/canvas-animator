import { describe, expect, it } from 'vitest';
import { chartBox, createChart, createText, migrateChart, migrateText, textBox } from '../overlays';
import { attachToPath, hitTestBox, sampleActor, setActorProperty, shiftActorTime, toggleAnimated } from '../actor';
import type { MotionPath } from '../../types';

const chartContent = {
  id: 'c1',
  title: 'Vendas',
  type: 'bar' as const,
  width: 200,
  height: 100,
  data: [],
  animationType: 'grow' as const,
  visible: true,
  startFrame: 10,
  durationFrames: 40,
};

describe('charts and texts share the actor motion model', () => {
  it('starts static at the given anchor', () => {
    const chart = createChart(chartContent, { x: 300, y: 200 });
    expect(sampleActor(chart, 20)).toMatchObject({ x: 300, y: 200, scale: 1, rotation: 0, opacity: 1, visible: true });
    expect(sampleActor(chart, 60).visible).toBe(false);
  });

  it('follows the stopwatch rule and keeps its own type', () => {
    let chart = createChart(chartContent, { x: 0, y: 0 });
    chart = toggleAnimated(chart, 'opacity', 10);
    chart = setActorProperty(chart, 'opacity', 30, 0.5);
    expect(chart.title).toBe('Vendas');
    expect(sampleActor(chart, 30).opacity).toBeCloseTo(0.5);
    expect(sampleActor(chart, 10).opacity).toBeCloseTo(1);
    const moved = shiftActorTime(chart, 5);
    expect(moved.startFrame).toBe(15);
    expect(moved.tracks.opacity!.map((k) => k.frame)).toEqual([15, 35]);
  });

  it('hit-tests the rotated and scaled box', () => {
    let chart = createChart(chartContent, { x: 300, y: 200 });
    expect(hitTestBox(chart, chartBox(chart), 20, { x: 390, y: 200 })).toBe(true);
    chart = setActorProperty(chart, 'rotation', 20, 90);
    // After 90°, the 200×100 card is 100 wide and 200 tall
    expect(hitTestBox(chart, chartBox(chart), 20, { x: 390, y: 200 })).toBe(false);
    expect(hitTestBox(chart, chartBox(chart), 20, { x: 300, y: 290 })).toBe(true);
  });

  it('text box starts at the baseline anchor', () => {
    const text = createText(
      { id: 't', text: 'Olá', fontSize: 20, color: '#fff', effect: 'fadeRise', visible: true, startFrame: 1, durationFrames: 10 },
      { x: 50, y: 80 }
    );
    const box = textBox(text);
    expect(hitTestBox(text, box, 5, { x: 60, y: 75 })).toBe(true);
    expect(hitTestBox(text, box, 5, { x: 30, y: 75 })).toBe(false);
  });

  it('can travel a drawn path like an actor', () => {
    const path: MotionPath = {
      id: 'p', name: 'p', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], smooth: false, closed: false,
      style: { visible: true, color: '#fff', width: 2, stroke: 'dashed', reveal: 'full' },
      startFrame: 1, durationFrames: 100,
    };
    const chart = attachToPath(createChart(chartContent, { x: 0, y: 0 }), path);
    expect(sampleActor(chart, 10, [path]).x).toBeCloseTo(0);
    expect(sampleActor(chart, 50, [path]).x).toBeCloseTo(100);
  });
});

describe('migration of the old motion tween', () => {
  it('moves a chart anchor from its top-left corner to its center', () => {
    const chart = migrateChart({ ...chartContent, x: 100, y: 50 });
    expect(chart.base).toMatchObject({ x: 200, y: 100 });
    expect(chart.tracks).toEqual({});
    expect('x' in chart).toBe(false);
  });

  it('turns P1→P2 into two position keys over the clip', () => {
    const chart = migrateChart({
      ...chartContent, x: 0, y: 0, endX: 300, endY: 0, hasMotionTween: true, easing: 'bounce',
    });
    expect(chart.tracks.position).toEqual([
      { frame: 10, value: { x: 100, y: 50 }, easing: 'elasticOut' },
      { frame: 50, value: { x: 400, y: 50 } },
    ]);
    expect(['endX', 'hasMotionTween'].some((k) => k in chart)).toBe(false);
    expect(sampleActor(chart, 50).x).toBeCloseTo(400);
  });

  it('keeps texts that already use keyframes', () => {
    const text = createText(
      { id: 't', text: 'x', fontSize: 20, color: '#fff', effect: 'fadeRise', visible: true, startFrame: 1, durationFrames: 10 },
      { x: 5, y: 6 }
    );
    expect(migrateText(JSON.parse(JSON.stringify(text)))).toEqual(text);
    expect(migrateText({ text: 'old', x: 5, y: 6, startFrame: 1, durationFrames: 10 }).base).toMatchObject({ x: 5, y: 6 });
  });
});
