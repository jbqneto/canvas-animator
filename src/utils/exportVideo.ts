import {
  FrameData,
  Animated,
  ChartOverlay,
  TextOverlay,
  VideoBackground,
  ImageOverlay,
  StudioLayer,
  StickFigure,
  DrawingStroke,
  LayerType,
  ActorOverlay,
  MotionPath,
} from '../types';
import { sampleActor, trailPoints } from '../engine/actor';
import { polylineUpTo, samplePath } from '../engine/path';
import { sampleTrack, Vec2 } from '../engine/keyframes';
import { t } from '../i18n';
import { calculateEasing, parseLocaleNumber, formatNumberBR } from './motionUtils';
import { getCachedImage, isImageReady, preloadImages } from './imageCache';
// The encoder library is only needed when exporting: loaded on demand to keep the editor bundle small
const loadMediabunny = () => import('mediabunny');

/** Everything that makes up the scene, independent of which frame is drawn. */
export interface SceneContent {
  frames: Record<number, FrameData>;
  charts: ChartOverlay[];
  texts: TextOverlay[];
  images: ImageOverlay[];
  actors: ActorOverlay[];
  paths: MotionPath[];
  layers?: StudioLayer[];
  videoBg: VideoBackground;
  videoElement?: HTMLVideoElement | null;
}

export interface RenderOptions {
  /** Editor-only helper grid. Never part of an exported frame. */
  showGrid?: boolean;
  /** Skip the stage background (color and video): only the animated elements, with alpha. */
  transparent?: boolean;
}

/**
 * An object belongs to the layer that targets it; otherwise to the first layer of its type.
 * Shared by the renderer (order/visibility) and the stage (lock/visibility on hit-testing).
 */
export function resolveObjectLayer(
  layers: StudioLayer[] | undefined,
  targetId: string | undefined,
  type: LayerType
): { index: number; layer: StudioLayer } | undefined {
  if (!layers) return undefined;
  let index = targetId ? layers.findIndex((l) => l.targetId === targetId) : -1;
  if (index === -1) index = layers.findIndex((l) => l.type === type);
  return index === -1 ? undefined : { index, layer: layers[index] };
}

/**
 * Utility to render a specific frame onto a standard 2D canvas context.
 * Used both for the live preview and for offline frame-by-frame video export.
 *
 * Draw order follows the layer panel (top row = front), like Flash.
 */
export function renderCompositeFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  currentFrame: number,
  scene: SceneContent,
  options: RenderOptions = {}
) {
  const { charts, texts, images, actors, paths, videoBg, videoElement, layers } = scene;
  const frameData = scene.frames[currentFrame];
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const resolveLayer = (targetId: string | undefined, type: LayerType) =>
    resolveObjectLayer(layers, targetId, type);

  // 1. Draw Background
  const videoLayer = layers?.find((layer) => layer.type === 'video');
  if (options.transparent) {
    // nothing: the canvas stays transparent behind the elements
  } else if (!videoLayer || videoLayer.visible) {
    if (videoBg.type === 'color' || !videoElement || videoElement.readyState < 2) {
      ctx.fillStyle = videoBg.color || '#09090b';
      ctx.fillRect(0, 0, width, height);
    }

    // Draw video frame if present
    if (videoElement && videoElement.readyState >= 2 && videoBg.type !== 'color') {
      ctx.globalAlpha = videoBg.opacity;
      const hRatio = width / videoElement.videoWidth;
      const vRatio = height / videoElement.videoHeight;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (width - videoElement.videoWidth * ratio) / 2;
      const centerShiftY = (height - videoElement.videoHeight * ratio) / 2;
      ctx.drawImage(
        videoElement,
        0,
        0,
        videoElement.videoWidth,
        videoElement.videoHeight,
        centerShiftX,
        centerShiftY,
        videoElement.videoWidth * ratio,
        videoElement.videoHeight * ratio
      );
      ctx.globalAlpha = 1.0;
    }
  } else {
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);
  }

  // Subtle grid for studio atmosphere (editor only)
  if (options.showGrid) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  // 2. Collect every visible object with its layer depth, then paint back to front.
  // Objects without a layer keep the historical order: images at the back, texts in front.
  const drawables: { depth: number; seq: number; draw: () => void }[] = [];
  const add = (
    targetId: string | undefined,
    type: LayerType,
    fallbackDepth: number,
    draw: () => void
  ) => {
    const resolved = resolveLayer(targetId, type);
    if (resolved && !resolved.layer.visible) return;
    drawables.push({ depth: resolved ? resolved.index : fallbackDepth, seq: drawables.length, draw });
  };
  const BACK = Number.MAX_SAFE_INTEGER;
  const FRONT = -1;

  images.forEach((img) => {
    if (currentFrame < img.startFrame || currentFrame > img.startFrame + img.durationFrames) return;
    add(img.id, 'image', BACK, () => drawImageOverlay(ctx, img, currentFrame, width, height));
  });
  paths.forEach((path) => {
    if (!path.style.visible || path.points.length < 2) return;
    if (currentFrame < path.startFrame || currentFrame > path.startFrame + path.durationFrames) return;
    add(path.id, 'path', FRONT, () => drawMotionPath(ctx, path, [...actors, ...charts, ...texts], currentFrame));
  });
  actors.forEach((actor) => {
    const state = sampleActor(actor, currentFrame, paths);
    if (!state.visible || state.opacity <= 0) return;
    add(actor.id, 'actor', FRONT, () => drawActor(ctx, actor, state, currentFrame, paths));
  });
  frameData?.stickFigures?.forEach((stick) => {
    add(stick.id, 'drawing', FRONT, () => drawStickFigure(ctx, stick));
  });
  frameData?.drawings?.forEach((stroke) => {
    if (!stroke.points || stroke.points.length === 0) return;
    add(stroke.groupId, 'drawing', FRONT, () => drawStroke(ctx, stroke));
  });
  // Charts and texts: the same keyframed transform as actors, then their own intro inside it
  const withTransform = (obj: Animated, draw: () => void) => {
    const state = sampleActor(obj, currentFrame, paths);
    if (!state.visible || state.opacity <= 0) return null;
    return () => {
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate((state.rotation * Math.PI) / 180);
      ctx.scale(state.scale, state.scale);
      ctx.globalAlpha *= state.opacity;
      draw();
      ctx.restore();
    };
  };
  charts.forEach((chart) => {
    if (!chart.visible) return;
    const draw = withTransform(chart, () => drawChart(ctx, chart, currentFrame));
    if (draw) add(chart.id, 'chart', FRONT, draw);
  });
  texts.forEach((txt) => {
    if (!txt.visible) return;
    const draw = withTransform(txt, () => drawText(ctx, txt, currentFrame));
    if (draw) add(txt.id, 'text', FRONT, draw);
  });

  drawables
    .sort((a, b) => b.depth - a.depth || a.seq - b.seq)
    .forEach((d) => d.draw());

  ctx.restore();
}

function drawImageOverlay(
  ctx: CanvasRenderingContext2D,
  img: ImageOverlay,
  currentFrame: number,
  width: number,
  height: number
) {
  const imgEl = getCachedImage(img.url);
  if (!isImageReady(imgEl)) return;

  const elapsed = currentFrame - img.startFrame;
  let alpha = 1;
  let scale = 1;
  let floatY = 0;
  if (img.animationType === 'pop') {
    const progress = Math.min(1, elapsed / 8);
    scale = 0.5 + 0.5 * Math.sin((progress * Math.PI) / 2);
  } else if (img.animationType === 'fade') {
    alpha = Math.min(1, elapsed / 10);
  } else if (img.animationType === 'float') {
    floatY = Math.sin(elapsed * 0.12) * 6;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  // Legacy: values <= 100 are percentages of the canvas (AI images are placed at 50/50)
  const cx = img.x > 100 ? img.x : (img.x / 100) * width;
  const cy = img.y > 100 ? img.y : (img.y / 100) * height;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(imgEl, cx - w / 2, cy - h / 2 + floatY, w, h);
  ctx.restore();
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  actor: ActorOverlay,
  state: ReturnType<typeof sampleActor>,
  frame: number,
  paths: MotionPath[]
) {
  // Travelled path behind the actor
  if (actor.trail?.enabled) {
    const pts = trailPoints(actor, frame, paths);
    if (pts.length > 1) {
      ctx.save();
      ctx.globalAlpha = state.opacity;
      ctx.strokeStyle = actor.trail.color;
      ctx.lineWidth = actor.trail.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (actor.trail.dashed) ctx.setLineDash([actor.trail.width * 3, actor.trail.width * 2.5]);
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    }
  }

  const img = getCachedImage(actor.src);
  if (!isImageReady(img)) return;
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.translate(state.x, state.y);
  ctx.rotate((state.rotation * Math.PI) / 180);
  ctx.scale(state.scale * (actor.flipX ? -1 : 1), state.scale);
  ctx.drawImage(img, -actor.width / 2, -actor.height / 2, actor.width, actor.height);
  ctx.restore();
}

/** Canvas dash pattern for a stroke style (dotted = round dots spaced by ~2× the width). */
export function strokeDash(stroke: MotionPath['style']['stroke'], width: number): number[] {
  if (stroke === 'dashed') return [width * 3, width * 2.5];
  if (stroke === 'dotted') return [0.001, width * 2.2];
  return [];
}

function drawMotionPath(ctx: CanvasRenderingContext2D, path: MotionPath, followers: Animated[], frame: number) {
  const sampler = samplePath(path);
  let points: Vec2[] = sampler.samples;
  if (path.style.reveal === 'follow') {
    // Only the part already travelled by the furthest object following this path
    const onPath = followers.filter((a) => a.follow?.pathId === path.id);
    const progress = Math.max(0, ...onPath.map((a) => sampleTrack(a.follow!.progress, frame, 0)));
    points = polylineUpTo(sampler, progress);
  }
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = path.style.color;
  ctx.lineWidth = path.style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(strokeDash(path.style.stroke, path.style.width));
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

function drawStickFigure(ctx: CanvasRenderingContext2D, stick: StickFigure) {
  ctx.save();
  ctx.translate(stick.x, stick.y);
  ctx.scale(stick.scale, stick.scale);

  // Draw Bones
  ctx.strokeStyle = stick.color;
  ctx.lineWidth = stick.thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  stick.bones.forEach((bone) => {
    const fromJ = stick.joints[bone.from];
    const toJ = stick.joints[bone.to];
    if (fromJ && toJ) {
      ctx.beginPath();
      ctx.moveTo(fromJ.x, fromJ.y);
      ctx.lineTo(toJ.x, toJ.y);
      ctx.stroke();
    }
  });

  // Draw Head
  const head = stick.joints['head'];
  if (head) {
    ctx.fillStyle = stick.color;
    ctx.beginPath();
    ctx.arc(head.x, head.y, head.radius || 20, 0, Math.PI * 2);
    ctx.fill();

    // Eye indicator for face direction
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(head.x + 6, head.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Joints
  Object.values(stick.joints).forEach((joint) => {
    if (joint.id !== 'head') {
      ctx.fillStyle = joint.color || stick.color;
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, stick.thickness / 2 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.restore();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawingStroke) {
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'pen' && stroke.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  } else if (stroke.tool === 'line' && stroke.points.length >= 2) {
    const p1 = stroke.points[0];
    const p2 = stroke.points[stroke.points.length - 1];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  } else if (stroke.tool === 'arrow' && stroke.points.length >= 2) {
    const p1 = stroke.points[0];
    const p2 = stroke.points[stroke.points.length - 1];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headLen = 14;
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(
      p2.x - headLen * Math.cos(angle - Math.PI / 6),
      p2.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      p2.x - headLen * Math.cos(angle + Math.PI / 6),
      p2.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === 'rect' && stroke.points.length >= 2) {
    const p1 = stroke.points[0];
    const p2 = stroke.points[stroke.points.length - 1];
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
  } else if (stroke.tool === 'circle' && stroke.points.length >= 2) {
    const p1 = stroke.points[0];
    const p2 = stroke.points[stroke.points.length - 1];
    const rx = Math.abs(p2.x - p1.x) / 2;
    const ry = Math.abs(p2.y - p1.y) / 2;
    const cx = Math.min(p1.x, p2.x) + rx;
    const cy = Math.min(p1.y, p2.y) + ry;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Elastic ease-out: overshoots and settles at 1. */
function elasticOut(p: number): number {
  const c4 = (2 * Math.PI) / 3;
  return p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
}

/** Largest value used as the 100% reference of bar/line charts (never 0, never a fake floor). */
function chartMaxValue(chart: ChartOverlay): number {
  const max = Math.max(0, ...chart.data.map((d) => d.value));
  return max > 0 ? max : 1;
}

function drawChart(ctx: CanvasRenderingContext2D, chart: ChartOverlay, currentFrame: number) {
  const elapsed = currentFrame - chart.startFrame;
  const animType = chart.animationType || 'grow';
  // Use the actual duration configured by the user (e.g. 60 or 120 frames)
  const animDuration = chart.animDurationFrames || chart.durationFrames || 30;
  const progress = Math.min(1, Math.max(0, elapsed / Math.max(1, animDuration)));

  // Calculate ease progress based on animation type
  let easeProgress = 1;
  let cardScale = 1;
  let cardAlpha = 1;
  let cardOffsetY = 0;

  if (animType === 'grow') {
    easeProgress = calculateEasing(progress, chart.easing || 'easeOut');
  } else if (animType === 'bounce') {
    easeProgress = elasticOut(progress);
    cardScale = 0.85 + 0.15 * easeProgress;
  } else if (animType === 'slideUp') {
    easeProgress = calculateEasing(progress, chart.easing || 'easeOut');
    cardOffsetY = (1 - easeProgress) * 40;
    cardAlpha = easeProgress;
  } else if (animType === 'fade') {
    cardAlpha = calculateEasing(progress, chart.easing || 'easeOut');
    easeProgress = 1 - Math.pow(1 - progress, 2);
  } else if (animType === 'elastic') {
    easeProgress = elasticOut(progress);
  }

  // Already translated to the card's center (its anchor) by the caller
  ctx.save();
  ctx.translate(-chart.width / 2, -chart.height / 2 + cardOffsetY);
  ctx.globalAlpha *= Math.max(0, Math.min(1, cardAlpha));
  ctx.scale(cardScale, cardScale);

  // Card container background with modern glass aesthetics
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 0, 0, chart.width, chart.height, 12);
  ctx.fill();
  ctx.stroke();

  // Chart Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(chart.title, 16, 26);

  // Render by Chart Type
  if (chart.type === 'bar') {
    const barAreaTop = 45;
    const barAreaHeight = chart.height - 75;
    const maxVal = chartMaxValue(chart);
    const colWidth = (chart.width - 32) / (chart.data.length || 1);

    chart.data.forEach((d, i) => {
      const clampedEase = Math.max(0, Math.min(1.2, easeProgress));
      const barH = (Math.max(0, d.value) / maxVal) * barAreaHeight * clampedEase;
      const bx = 16 + i * colWidth + colWidth * 0.15;
      const bw = colWidth * 0.7;
      const by = barAreaTop + barAreaHeight - Math.max(0, barH);

      // Bar Gradient
      const grad = ctx.createLinearGradient(0, by, 0, by + barH);
      grad.addColorStop(0, d.color || '#38bdf8');
      grad.addColorStop(1, 'rgba(14, 165, 233, 0.4)');

      ctx.fillStyle = grad;
      roundRect(ctx, bx, by, bw, Math.max(4, barH), 4);
      ctx.fill();

      // Bar Value Label
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      const displayedVal = Math.round(d.value * Math.min(1, easeProgress));
      ctx.fillText(`${displayedVal}`, bx + bw / 2, by - 5);

      // Bar Category Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.fillText(d.label, bx + bw / 2, chart.height - 10);
    });
  } else if (chart.type === 'donut') {
    const centerX = chart.width / 2;
    const centerY = chart.height / 2 + 10;
    const radius = Math.min(chart.width, chart.height) * 0.28;
    const totalVal = chart.data.reduce((acc, d) => acc + Math.max(0, d.value), 0) || 1;

    let startAngle = -Math.PI / 2;
    chart.data.forEach((d) => {
      const sliceAngle = (Math.max(0, d.value) / totalVal) * Math.PI * 2 * Math.min(1, easeProgress);
      ctx.strokeStyle = d.color || '#38bdf8';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // Center Percentage
    const firstVal = Math.max(0, chart.data[0]?.value || 0);
    const pct = Math.round((firstVal / totalVal) * 100 * Math.min(1, easeProgress));
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${pct}%`, centerX, centerY + 6);
  } else if (chart.type === 'line') {
    const areaLeft = 24;
    const areaTop = 45;
    const areaWidth = chart.width - 48;
    const areaHeight = chart.height - 75;
    const maxVal = chartMaxValue(chart);

    if (chart.data.length > 1) {
      const stepX = areaWidth / (chart.data.length - 1);
      const pointY = (value: number) => {
        const targetPy = areaTop + areaHeight - (Math.max(0, value) / maxVal) * areaHeight;
        return areaTop + areaHeight - (areaTop + areaHeight - targetPy) * Math.min(1, easeProgress);
      };

      ctx.beginPath();
      chart.data.forEach((d, idx) => {
        const px = areaLeft + idx * stepX;
        const py = pointY(d.value);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Points
      chart.data.forEach((d, idx) => {
        const px = areaLeft + idx * stepX;
        const py = pointY(d.value);
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  } else if (chart.type === 'stat' && chart.statMetric) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Plus Jakarta Sans, sans-serif';
    ctx.fillText(chart.statMetric.label, 20, 55);

    // Keeps decimals ("4,5" stays 4,5) and shows non-numeric values as typed
    const parsed = parseLocaleNumber(chart.statMetric.value);
    const shown = parsed
      ? formatNumberBR(parsed.value * Math.min(1, easeProgress), parsed.decimals)
      : chart.statMetric.value;

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 36px JetBrains Mono, monospace';
    ctx.fillText(`${shown}${chart.statMetric.suffix}`, 20, 98);
  }

  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, txt: TextOverlay, currentFrame: number) {
  const elapsed = currentFrame - txt.startFrame;
  // Already translated to the text anchor by the caller; effects work relative to it
  ctx.save();
  const parentAlpha = ctx.globalAlpha;

  let displayedText = txt.text;
  let alpha = 1;
  let scale = 1;
  let offsetY = 0;

  // Handle animated number ticker if configured
  if (txt.isNumberCounter || txt.effect === 'numberRoll') {
    const startVal = txt.counterStart ?? 0;
    const endVal = txt.counterEnd ?? 1000;
    const animDuration = txt.animDurationFrames || txt.durationFrames || 30;
    const progress = Math.min(1, elapsed / Math.max(1, animDuration));
    const ease = calculateEasing(progress, txt.easing || 'easeOut');
    const currentVal = startVal + (endVal - startVal) * ease;
    const decimals = Math.max(0, txt.counterDecimals ?? 0);
    const formattedVal = formatNumberBR(currentVal, decimals);
    displayedText = `${txt.counterPrefix || ''}${formattedVal}${txt.counterSuffix || ''}`;
  } else if (txt.effect === 'typewriter') {
    const charDuration = 2; // frames per char
    const charsToShow = Math.min(txt.text.length, Math.floor(elapsed / charDuration));
    displayedText = txt.text.slice(0, charsToShow);
    // Blinking cursor
    if (charsToShow < txt.text.length && Math.floor(elapsed / 8) % 2 === 0) {
      displayedText += '|';
    }
  } else if (txt.effect === 'bouncePop') {
    const progress = Math.min(1, elapsed / 12);
    scale =
      progress < 0.7 ? 0.4 + (progress / 0.7) * 0.8 : 1.2 - ((progress - 0.7) / 0.3) * 0.2;
  } else if (txt.effect === 'fadeRise') {
    alpha = Math.min(1, elapsed / 10);
    offsetY = (1 - alpha) * 20;
  } else if (txt.effect === 'slideLeft') {
    const progress = Math.min(1, elapsed / 12);
    const ease = 1 - Math.pow(1 - progress, 3);
    ctx.translate((1 - ease) * -100, 0);
  } else if (txt.effect === 'glowPulse') {
    const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.25);
    scale = pulse;
  }

  ctx.globalAlpha = parentAlpha * alpha;
  ctx.scale(scale, scale);

  // Badge if present
  if (txt.badge) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    roundRect(ctx, 0, offsetY - 26, 110, 20, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(txt.badge.toUpperCase(), 55, offsetY - 12);
  }

  // Main Text
  ctx.textAlign = 'left';
  ctx.fillStyle = txt.color || '#ffffff';
  ctx.font = `800 ${txt.fontSize}px Plus Jakarta Sans, sans-serif`;

  // Text glow shadow for legibility over video
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillText(displayedText, 0, offsetY);

  // Subtitle if provided
  if (txt.subtitle && elapsed > 6) {
    const subAlpha = Math.min(1, (elapsed - 6) / 8);
    ctx.globalAlpha = parentAlpha * subAlpha * alpha;
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 ${Math.max(12, Math.round(txt.fontSize * 0.45))}px Plus Jakarta Sans, sans-serif`;
    ctx.fillText(txt.subtitle, 0, offsetY + txt.fontSize * 0.7);
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Time in the background video that corresponds to a timeline frame (the video loops). */
export function videoTimeForFrame(frame: number, fps: number, videoDuration: number): number {
  const t = (frame - 1) / fps;
  return videoDuration > 0 && Number.isFinite(videoDuration) ? t % videoDuration : t;
}

/** Seeks the video and waits until the new frame is decoded (with a safety timeout). */
export function seekVideo(video: HTMLVideoElement, time: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-3 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    video.addEventListener('seeked', done);
    video.currentTime = time;
  });
}

export type ExportFormat = 'mp4' | 'webm-alpha';

export interface ExportedVideo {
  blob: Blob;
  /** File extension matching the container that was actually produced ('mp4' or 'webm'). */
  extension: 'mp4' | 'webm';
  /** Audio was requested but the browser can't encode it for this container, so it was left out. */
  audioDropped?: boolean;
}

/** First audio codec this browser can encode for the container (AAC for MP4 when available). */
async function pickAudioCodec(format: { getSupportedAudioCodecs(): string[] }, audio: AudioBuffer) {
  const { getFirstEncodableAudioCodec } = await loadMediabunny();
  const preferred = ['aac', 'opus', 'vorbis'] as const;
  const supported = format.getSupportedAudioCodecs();
  return getFirstEncodableAudioCodec(
    preferred.filter((c) => supported.includes(c)),
    { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate }
  );
}

/**
 * Picks the container/codec. Opaque: MP4/H.264 first (every editor opens it), then WebM.
 * Transparent: only VP9/VP8 in WebM carry alpha (same constraint Remotion documents).
 */
async function pickOutputFormat(width: number, height: number, transparent: boolean) {
  const { Mp4OutputFormat, WebMOutputFormat, getFirstEncodableVideoCodec } = await loadMediabunny();
  if (transparent) {
    const webm = new WebMOutputFormat();
    const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height });
    return codec ? { format: webm, codec, extension: 'webm' as const } : null;
  }
  const mp4 = new Mp4OutputFormat({ fastStart: 'in-memory' });
  const mp4Codec = await getFirstEncodableVideoCodec(
    mp4.getSupportedVideoCodecs().filter((c) => c === 'avc' || c === 'hevc'),
    { width, height }
  );
  if (mp4Codec) return { format: mp4, codec: mp4Codec, extension: 'mp4' as const };

  const webm = new WebMOutputFormat();
  const webmCodec = await getFirstEncodableVideoCodec(
    webm.getSupportedVideoCodecs().filter((c) => c === 'vp9' || c === 'vp8'),
    { width, height }
  );
  if (webmCodec) return { format: webm, codec: webmCodec, extension: 'webm' as const };
  return null;
}

/**
 * Renders the entire animation timeline into a video file.
 *
 * Frames are encoded with WebCodecs using explicit timestamps, so the result has exactly
 * `totalFrames / fps` seconds no matter how long each frame takes to render or seek.
 * (MediaRecorder timestamps by wall clock: slow video seeks stretched the exported video.)
 */
export async function exportVideoSequence(
  scene: SceneContent,
  options: {
    totalFrames: number;
    fps: number;
    width: number;
    height: number;
    onProgress?: (progress: number) => void;
    format?: ExportFormat;
    /** Inclusive frame range; defaults to the whole timeline. */
    startFrame?: number;
    endFrame?: number;
    /** Sound for the exported range (already mixed and exactly as long as it). */
    audio?: AudioBuffer | null;
  }
): Promise<ExportedVideo> {
  const { totalFrames, fps, onProgress } = options;
  const transparent = options.format === 'webm-alpha';
  const first = Math.max(1, Math.min(totalFrames, options.startFrame ?? 1));
  const last = Math.max(first, Math.min(totalFrames, options.endFrame ?? totalFrames));
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(t('exportVideo.error.noWebCodecs'));
  }

  // H.264 requires even dimensions
  const width = options.width - (options.width % 2);
  const height = options.height - (options.height % 2);
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d')!;

  const picked = await pickOutputFormat(width, height, transparent);
  if (!picked) {
    throw new Error(
      transparent
        ? t('exportVideo.error.noAlphaCodec')
        : t('exportVideo.error.noCodec')
    );
  }

  // Everything the frames depend on must be ready before encoding starts
  await document.fonts.ready;
  await preloadSceneImages(scene);

  // A transparent export never shows the background video, so there's nothing to seek
  const video = !transparent && scene.videoBg.type !== 'color' ? scene.videoElement ?? null : null;
  const restoreVideoTime = video?.currentTime ?? 0;
  video?.pause();

  const { Output, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH } = await loadMediabunny();
  const output = new Output({ format: picked.format, target: new BufferTarget() });
  const source = new CanvasSource(exportCanvas, {
    codec: picked.codec,
    bitrate: QUALITY_HIGH,
    keyFrameInterval: 2,
    alpha: transparent ? 'keep' : 'discard',
  });
  output.addVideoTrack(source, { frameRate: fps });

  const audio = options.audio ?? null;
  const audioCodec = audio ? await pickAudioCodec(picked.format, audio) : null;
  const audioSource = audio && audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();
  // The whole mix goes in up front; mediabunny interleaves it with the video as frames arrive
  const audioDone = audio && audioSource ? audioSource.add(audio).then(() => audioSource.close()) : null;

  const frameDuration = 1 / fps;
  try {
    for (let f = first; f <= last; f++) {
      if (video) {
        await seekVideo(video, videoTimeForFrame(f, fps, video.duration));
      }

      renderCompositeFrame(ctx, width, height, f, { ...scene, videoElement: video }, { transparent });
      await source.add((f - first) * frameDuration, frameDuration);

      if (onProgress) {
        onProgress(Math.round(((f - first + 1) / (last - first + 1)) * 100));
      }
    }
    source.close();
    await audioDone;
    await output.finalize();
  } catch (err) {
    await output.cancel();
    throw err;
  } finally {
    if (video) await seekVideo(video, restoreVideoTime);
  }

  const mimeType = picked.extension === 'mp4' ? 'video/mp4' : 'video/webm';
  return {
    blob: new Blob([output.target.buffer!], { type: mimeType }),
    extension: picked.extension,
    audioDropped: !!audio && !audioSource,
  };
}

/** Renders one clean frame (no grid, no selection handles) and downloads it as PNG. */
export async function exportFramePNG(
  params: Parameters<typeof renderFrameToDataURL>[0],
  filename: string = 'snapshot.png'
) {
  const url = await renderFrameToDataURL(params);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

/** Renders one clean frame into an offscreen canvas and returns it as a PNG data URL. */
export async function renderFrameToDataURL(params: {
  width: number;
  height: number;
  frame: number;
  scene: SceneContent;
}): Promise<string> {
  await document.fonts.ready;
  await preloadSceneImages(params.scene);
  const canvas = document.createElement('canvas');
  canvas.width = params.width;
  canvas.height = params.height;
  renderCompositeFrame(canvas.getContext('2d')!, params.width, params.height, params.frame, params.scene);
  return canvas.toDataURL('image/png');
}

function preloadSceneImages(scene: SceneContent): Promise<void> {
  return preloadImages([...scene.images.map((img) => img.url), ...scene.actors.map((a) => a.src)]);
}
