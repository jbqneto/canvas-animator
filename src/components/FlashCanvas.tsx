import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  StickFigure,
  DrawingStroke,
  Point,
  FrameData,
  ChartOverlay,
  TextOverlay,
  ImageOverlay,
  VideoBackground,
  StudioLayer,
  SelectedObjectRef,
  CanvasGroup,
  HistorySnapshot,
  ActorOverlay,
  Animated,
  MotionPath,
  StageTool,
} from '../types';
import { distanceToPath, samplePath } from '../engine/path';
import { strokeDash } from '../utils/exportVideo';
import {
  hitTestActor,
  hitTestBox,
  LocalBox,
  sampleActor,
  setActorProperty,
  actorPropertyValue,
  followedPath,
  toActorLocal,
} from '../engine/actor';
import { chartBox, textBox } from '../engine/overlays';

type AnimKind = 'actor' | 'chart' | 'text';
const KIND_COLOR: Record<AnimKind, string> = { actor: '#f97316', chart: '#0ea5e9', text: '#10b981' };
import { pathPolyline, samplePosition, setKeyframe } from '../engine/keyframes';
import { dragJointFK } from '../engine/stickRig';
import { useI18n } from '../i18n';

const PATH_KEY_HIT_RADIUS = 9;
type Vec2Like = { x: number; y: number };
import { renderCompositeFrame, resolveObjectLayer } from '../utils/exportVideo';
import { onImageLoaded } from '../utils/imageCache';
import {
  MousePointer,
  Move,
  PenTool,
  Minus,
  MoveRight,
  Square,
  Circle,
  Eraser,
  Eye,
  Group,
  Ungroup,
  Trash2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Route as RouteIcon,
} from 'lucide-react';

interface FlashCanvasProps {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  frames: Record<number, FrameData>;
  onUpdateFrameData: (frameNum: number, data: FrameData) => void;
  onTransientUpdateFrameData: (frameNum: number, data: FrameData) => void;
  onCommitFrameData: (
    frameNum: number,
    data: FrameData,
    description: string,
    baseSnapshot: HistorySnapshot
  ) => void;
  selectedObject: SelectedObjectRef | null;
  onSelectObject: (ref: SelectedObjectRef | null) => void;
  activeTool: StageTool;
  setActiveTool: (tool: any) => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  strokeThickness: number;
  setStrokeThickness: (thickness: number) => void;
  onionSkinEnabled: boolean;
  setOnionSkinEnabled: (val: boolean | ((prev: boolean) => boolean)) => void;
  onionSkinFrames: number;
  charts: ChartOverlay[];
  onUpdateChart: (chart: ChartOverlay) => void;
  onTransientUpdateChart: (chart: ChartOverlay) => void;
  onCommitChart: (
    chart: ChartOverlay,
    description: string,
    baseSnapshot: HistorySnapshot
  ) => void;
  onDeleteChart: (id: string) => void;
  texts: TextOverlay[];
  onUpdateText: (text: TextOverlay) => void;
  onTransientUpdateText: (text: TextOverlay) => void;
  onCommitText: (
    text: TextOverlay,
    description: string,
    baseSnapshot: HistorySnapshot
  ) => void;
  onDeleteText: (id: string) => void;
  images: ImageOverlay[];
  videoBg: VideoBackground;
  videoElement: HTMLVideoElement | null;
  isPlaying: boolean;
  layers: StudioLayer[];
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onDeleteStickFigure?: (stickId: string, allFrames?: boolean) => void;
  canvasWidth?: number;
  canvasHeight?: number;
  getCurrentSnapshot: () => HistorySnapshot;
  actors: ActorOverlay[];
  onTransientUpdateActor: (actor: ActorOverlay) => void;
  onCommitActor: (actor: ActorOverlay, description: string, baseSnapshot: HistorySnapshot) => void;
  onImportImageFiles: (files: FileList) => void;
  paths: MotionPath[];
  onCreatePath: (points: { x: number; y: number }[]) => void;
  onTransientUpdatePath: (path: MotionPath) => void;
  onCommitPath: (path: MotionPath, description: string, baseSnapshot: HistorySnapshot) => void;
}

const emptyFrame = (frameNumber: number): FrameData => ({
  frameNumber,
  stickFigures: [],
  drawings: [],
  groups: [],
});

// Distance from point to line segment (for stick figure bone hit testing)
function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

export const FlashCanvas: React.FC<FlashCanvasProps> = ({
  currentFrame,
  totalFrames,
  frames,
  onUpdateFrameData,
  onTransientUpdateFrameData,
  onCommitFrameData,
  selectedObject,
  onSelectObject,
  activeTool,
  setActiveTool,
  strokeColor,
  setStrokeColor,
  strokeThickness,
  setStrokeThickness,
  onionSkinEnabled,
  setOnionSkinEnabled,
  onionSkinFrames = 1,
  charts,
  onTransientUpdateChart,
  onCommitChart,
  onDeleteChart,
  texts,
  onTransientUpdateText,
  onCommitText,
  onDeleteText,
  images,
  videoBg,
  videoElement,
  isPlaying,
  layers,
  onGroupSelected,
  onUngroupSelected,
  onDeleteStickFigure,
  canvasWidth = 1280,
  canvasHeight = 720,
  getCurrentSnapshot,
  actors,
  onTransientUpdateActor,
  onCommitActor,
  onImportImageFiles,
  paths,
  onCreatePath,
  onTransientUpdatePath,
  onCommitPath,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom control for stage canvas view
  const [zoomMode, setZoomMode] = useState<'fit' | '50%' | '75%' | '100%'>('fit');

  // Hover state for interactive stick joints
  const [hoveredJoint, setHoveredJoint] = useState<{
    stickId: string;
    jointId: string;
  } | null>(null);

  // Motion path being drawn with the "Caminho" tool (click adds points)
  const [draftPath, setDraftPath] = useState<Point[] | null>(null);
  const [cursorPt, setCursorPt] = useState<Point | null>(null);

  const finishDraftPath = useCallback(() => {
    setDraftPath((draft) => {
      if (draft && draft.length >= 2) onCreatePath(draft);
      return null;
    });
  }, [onCreatePath]);

  useEffect(() => {
    if (activeTool !== 'path') setDraftPath(null);
  }, [activeTool]);

  useEffect(() => {
    if (!draftPath) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishDraftPath();
      } else if (e.key === 'Escape') {
        setDraftPath(null);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDraftPath((d) => (d && d.length > 1 ? d.slice(0, -1) : null));
      }
    };
    // Capture phase so Backspace removes a point instead of deleting the selected object
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [draftPath, finishDraftPath]);

  // Active freehand drawing stroke in progress
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  const strokeBaseSnapshotRef = useRef<HistorySnapshot | null>(null);

  // Drag Session tracking for mouse interaction
  const dragSessionRef = useRef<{
    targetType:
      | 'stick'
      | 'joint'
      | 'chart'
      | 'chart-resize'
      | 'text'
      | 'actor'
      | 'path-key'
      | 'path-anchor'
      | 'path-move';
    /** For 'path-anchor': index of the dragged point. */
    anchorIndex?: number;
    initialPath?: MotionPath;
    /** For 'path-key': frame of the position key being dragged. */
    keyFrame?: number;
    targetId: string;
    jointId?: string;
    resizeCorner?: string;
    startCanvasPt: Point;
    baseSnapshot: HistorySnapshot;
    hasMoved: boolean;
    // Copies of object state at drag start
    initialStick?: StickFigure;
    initialChart?: ChartOverlay;
    initialText?: TextOverlay;
    /** Actor, chart or text being moved/resized, as it was when the drag started. */
    objectKind?: AnimKind;
    initialObj?: Animated;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const currentFrameData = frames[currentFrame] || {
    frameNumber: currentFrame,
    stickFigures: [],
    drawings: [],
    groups: [],
  };

  // ================= ANIMATED OBJECTS (actors, charts, texts share the keyframed transform) =================
  const findAnimated = (
    kind: AnimKind,
    id: string,
    from: Pick<HistorySnapshot, 'actors' | 'charts' | 'texts'> = { actors, charts, texts }
  ): Animated | undefined =>
    kind === 'actor'
      ? from.actors.find((a) => a.id === id)
      : kind === 'chart'
        ? from.charts.find((c) => c.id === id)
        : from.texts.find((x) => x.id === id);

  const boxOf = (kind: AnimKind, obj: Animated): LocalBox => {
    if (kind === 'chart') return chartBox(obj as ChartOverlay);
    if (kind === 'text') return textBox(obj as TextOverlay);
    const a = obj as ActorOverlay;
    return { x: -a.width / 2, y: -a.height / 2, width: a.width, height: a.height };
  };

  /** The selected actor/chart/text with its local box and selection color, if any. */
  const selectedAnimated = () => {
    const kind = selectedObject?.type;
    if (kind !== 'actor' && kind !== 'chart' && kind !== 'text') return null;
    const obj = findAnimated(kind, selectedObject!.id);
    if (!obj || (kind !== 'actor' && !(obj as ChartOverlay | TextOverlay).visible)) return null;
    return { kind, obj, box: boxOf(kind, obj), color: KIND_COLOR[kind] };
  };

  const transientAnimated = (kind: AnimKind, obj: Animated) => {
    if (kind === 'actor') onTransientUpdateActor(obj as ActorOverlay);
    else if (kind === 'chart') onTransientUpdateChart(obj as ChartOverlay);
    else onTransientUpdateText(obj as TextOverlay);
  };

  // Convert mouse/touch event coordinates into canvas-space coordinates (0..canvasWidth, 0..canvasHeight)
  const getCanvasCoordinates = useCallback(
    (e: MouseEvent | React.MouseEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [canvasWidth, canvasHeight]
  );

  // Assets finish loading asynchronously (video seeks, images): bump a counter to redraw,
  // otherwise the stage keeps showing the previous video frame after a scrub.
  const [assetTick, setAssetTick] = useState(0);
  useEffect(() => onImageLoaded(() => setAssetTick((t) => t + 1)), []);
  useEffect(() => {
    if (!videoElement) return;
    const redraw = () => setAssetTick((t) => t + 1);
    const events = ['seeked', 'loadeddata'] as const;
    events.forEach((ev) => videoElement.addEventListener(ev, redraw));
    return () => events.forEach((ev) => videoElement.removeEventListener(ev, redraw));
  }, [videoElement]);

  // ================= MAIN CANVAS RENDER EFFECT =================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Render all animation elements through compositing pipeline
    renderCompositeFrame(
      ctx,
      canvasWidth,
      canvasHeight,
      currentFrame,
      { frames, charts, texts, images, actors, paths, videoBg, videoElement, layers },
      { showGrid: true }
    );

    // Optional Onion Skin (previous frame faint silhouette) ONLY IF explicitly turned ON
    if (onionSkinEnabled && currentFrame > 1) {
      const prevFrame = frames[currentFrame - 1];
      if (prevFrame && prevFrame.stickFigures) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        prevFrame.stickFigures.forEach((stick) => {
          ctx.save();
          ctx.translate(stick.x, stick.y);
          ctx.scale(stick.scale, stick.scale);
          ctx.strokeStyle = '#0284c7';
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
          const head = stick.joints['head'];
          if (head) {
            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.arc(head.x, head.y, head.radius || 20, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });
        ctx.restore();
      }
    }

    // 2. Render freehand stroke currently being drawn
    if (currentStroke && currentStroke.points.length > 1) {
      ctx.save();
      ctx.strokeStyle = currentStroke.color;
      ctx.lineWidth = currentStroke.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (currentStroke.tool === 'pen') {
        ctx.beginPath();
        ctx.moveTo(currentStroke.points[0].x, currentStroke.points[0].y);
        for (let i = 1; i < currentStroke.points.length; i++) {
          ctx.lineTo(currentStroke.points[i].x, currentStroke.points[i].y);
        }
        ctx.stroke();
      } else if (currentStroke.tool === 'line') {
        const start = currentStroke.points[0];
        const end = currentStroke.points[currentStroke.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else if (currentStroke.tool === 'arrow') {
        const start = currentStroke.points[0];
        const end = currentStroke.points[currentStroke.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - headLen * Math.cos(angle - Math.PI / 6),
          end.y - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - headLen * Math.cos(angle + Math.PI / 6),
          end.y - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      } else if (currentStroke.tool === 'rect') {
        const start = currentStroke.points[0];
        const end = currentStroke.points[currentStroke.points.length - 1];
        const rw = end.x - start.x;
        const rh = end.y - start.y;
        ctx.strokeRect(start.x, start.y, rw, rh);
      } else if (currentStroke.tool === 'circle') {
        const start = currentStroke.points[0];
        const end = currentStroke.points[currentStroke.points.length - 1];
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        const cx = Math.min(start.x, end.x) + rx;
        const cy = Math.min(start.y, end.y) + ry;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Selection Bounding Boxes, Interactive Joint Handles & Gizmos
    if (!isPlaying) {
      // 3A. Stick Figure Selection & Joint Rings
      currentFrameData.stickFigures.forEach((stick) => {
        const isSelected =
          selectedObject?.type === 'stick' && selectedObject.id === stick.id;

        // Render joint interactive rings
        Object.values(stick.joints).forEach((joint) => {
          const worldJx = stick.x + joint.x * stick.scale;
          const worldJy = stick.y + joint.y * stick.scale;
          const isHead = joint.id === 'head';
          const isHovered =
            hoveredJoint?.stickId === stick.id && hoveredJoint?.jointId === joint.id;

          ctx.save();
          ctx.beginPath();
          const ringRadius = (isHead ? 10 : 6) * stick.scale;
          ctx.arc(worldJx, worldJy, ringRadius, 0, Math.PI * 2);

          if (isHovered) {
            ctx.fillStyle = '#38bdf8';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
          } else if (isSelected) {
            ctx.fillStyle = joint.isControlPoint ? '#f59e0b' : '#38bdf8';
            ctx.strokeStyle = '#09090b';
            ctx.lineWidth = 1.5;
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.strokeStyle = '#09090b';
            ctx.lineWidth = 1;
          }
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });

        // Flash-style dashed selection box and center crosshair when selected
        if (isSelected) {
          ctx.save();
          ctx.translate(stick.x, stick.y);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(-70 * stick.scale, -145 * stick.scale, 140 * stick.scale, 280 * stick.scale);
          ctx.setLineDash([]);

          // Center Move Crosshair
          ctx.strokeStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.moveTo(-11, 0);
          ctx.lineTo(11, 0);
          ctx.moveTo(0, -11);
          ctx.lineTo(0, 11);
          ctx.stroke();
          ctx.restore();
        }
      });

      // 3E. Motion paths (editor only): hidden guides drawn faintly; selected path shows its points
      paths.forEach((path) => {
        const selected = selectedObject?.type === 'path' && selectedObject.id === path.id;
        if (path.points.length < 2 || (!selected && path.style.visible)) return;
        const pts = samplePath(path).samples;
        ctx.save();
        ctx.strokeStyle = selected ? 'rgba(56, 189, 248, 0.9)' : 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = selected ? 1.5 : 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.setLineDash([]);
        if (selected) {
          path.points.forEach((p, i) => {
            ctx.fillStyle = i === 0 ? '#22c55e' : '#38bdf8';
            ctx.strokeStyle = '#09090b';
            ctx.beginPath();
            ctx.rect(p.x - 5, p.y - 5, 10, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#e0f2fe';
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(String(i + 1), p.x + 8, p.y - 8);
          });
        }
        ctx.restore();
      });

      // 3F. Path being drawn: placed points + preview to the cursor
      if (draftPath && draftPath.length > 0) {
        const pts = cursorPt ? [...draftPath, cursorPt] : draftPath;
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.setLineDash(strokeDash('dotted', 3));
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.setLineDash([]);
        draftPath.forEach((p) => {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
        });
        ctx.fillStyle = '#e0f2fe';
        ctx.font = '11px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('stage.pathHint'), 12, canvasHeight - 12);
        ctx.restore();
      }

      // 3D. Selected actor, chart or text: motion guide + box following its animated transform
      const sel = selectedAnimated();
      if (sel) {
        const { obj, box, color } = sel;
        const posTrack = obj.tracks.position;
        if (posTrack && posTrack.length >= 2 && !followedPath(obj, paths)) {
          ctx.save();
          // Path (motion guide)
          const line = pathPolyline(posTrack, obj.smoothPath);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          // One dot per frame: spacing shows the speed (closer = slower), like AE
          ctx.fillStyle = 'rgba(253, 186, 116, 0.8)';
          for (let f = posTrack[0].frame; f <= posTrack[posTrack.length - 1].frame; f++) {
            const p = samplePosition(posTrack, f, obj.base, obj.smoothPath);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
          // Keyframe points (draggable). Keys at the same place (a pause) share one "F12–36" label.
          const samePlace = (a: Vec2Like, b: Vec2Like) => Math.hypot(a.x - b.x, a.y - b.y) < 1;
          posTrack.forEach((k, idx) => {
            if (idx > 0 && samePlace(posTrack[idx - 1].value, k.value)) return;
            let lastFrame = k.frame;
            for (let j = idx + 1; j < posTrack.length && samePlace(posTrack[j].value, k.value); j++) {
              lastFrame = posTrack[j].frame;
            }
            const isCurrent = currentFrame >= k.frame && currentFrame <= lastFrame;
            ctx.beginPath();
            ctx.rect(k.value.x - 5, k.value.y - 5, 10, 10);
            ctx.fillStyle = isCurrent ? '#ffffff' : color;
            ctx.strokeStyle = '#09090b';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fdba74';
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.textAlign = 'left';
            const label = lastFrame === k.frame ? `F${k.frame}` : `F${k.frame}–${lastFrame}`;
            ctx.fillText(label, k.value.x + 8, k.value.y - 8);
          });
          ctx.restore();
        }
        const st = sampleActor(obj, currentFrame, paths);
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.rotate((st.rotation * Math.PI) / 180);
        ctx.scale(st.scale, st.scale);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / (st.scale || 1);
        ctx.setLineDash(st.visible ? [] : [6, 4]);
        ctx.strokeRect(box.x - 3, box.y - 3, box.width + 6, box.height + 6);
        ctx.setLineDash([]);
        const dot = 4 / (st.scale || 1);
        if (sel.kind === 'chart') {
          // Resize handle (bottom-right corner)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(box.x + box.width + 3 - dot, box.y + box.height + 3 - dot, dot * 2, dot * 2);
          ctx.strokeRect(box.x + box.width + 3 - dot, box.y + box.height + 3 - dot, dot * 2, dot * 2);
        }
        // Anchor point (position, center of rotation and scale)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, dot, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }, [
    currentFrame,
    currentFrameData,
    onionSkinEnabled,
    onionSkinFrames,
    charts,
    texts,
    images,
    videoBg,
    videoElement,
    canvasWidth,
    canvasHeight,
    layers,
    selectedObject,
    hoveredJoint,
    currentStroke,
    isPlaying,
    frames,
    assetTick,
    actors,
    paths,
    draftPath,
    cursorPt,
    activeTool,
    t,
  ]);

  // ================= GLOBAL WINDOW DRAG LISTENERS =================
  // Keeps drag silky smooth, uninterrupted even if cursor leaves canvas boundary,
  // and saves to history ONLY on mouse up!
  const onWindowMouseMove = useCallback(
    (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      // Always read the latest committed/transient state: this listener is registered once on
      // mouse down, so props captured by the closure would be stale during the drag.
      const latest = getCurrentSnapshot();
      const currentFrameData = latest.frames[currentFrame] || emptyFrame(currentFrame);

      const pt = getCanvasCoordinates(e);
      const dist = Math.hypot(pt.x - session.startCanvasPt.x, pt.y - session.startCanvasPt.y);
      if (dist > 2) {
        session.hasMoved = true;
      }

      // Handle Joint Drag (Posing Stick Figure)
      if (session.targetType === 'joint' && session.jointId) {
        const stick = currentFrameData.stickFigures.find((s) => s.id === session.targetId);
        if (stick) {
          const local = { x: (pt.x - stick.x) / stick.scale, y: (pt.y - stick.y) / stick.scale };

          // Default: rotate the bone around its parent and bring the sub-chain along (FK, keeps
          // proportions like Pivot/Flash bones). Alt: move the joint freely (stretch the bone).
          const posed = e.altKey
            ? {
                ...stick,
                joints: {
                  ...stick.joints,
                  [session.jointId]: {
                    ...stick.joints[session.jointId],
                    x: Math.round(local.x),
                    y: Math.round(local.y),
                  },
                },
              }
            : dragJointFK(stick, session.jointId, local);

          // A hand-posed frame becomes a key pose (no longer an in-between)
          const updatedSticks = currentFrameData.stickFigures.map((s) =>
            s.id === stick.id ? { ...posed, tweened: false } : s
          );

          onTransientUpdateFrameData(currentFrame, {
            ...currentFrameData,
            stickFigures: updatedSticks,
          });
        }
      }

      // Handle Stick Figure Body Drag
      else if (session.targetType === 'stick') {
        const newX = Math.round(pt.x - session.offsetX);
        const newY = Math.round(pt.y - session.offsetY);

        const updatedSticks = currentFrameData.stickFigures.map((s) =>
          s.id === session.targetId ? { ...s, x: newX, y: newY, tweened: false } : s
        );

        onTransientUpdateFrameData(currentFrame, {
          ...currentFrameData,
          stickFigures: updatedSticks,
        });
      }

      // Chart resize (corner handle): the card grows around its center, so the mouse movement is
      // measured in the card's own (rotated, scaled) space and doubled
      else if (session.targetType === 'chart-resize' && session.initialChart) {
        const init = session.initialChart;
        const st = sampleActor(init, currentFrame, paths);
        const a = toActorLocal(st, session.startCanvasPt);
        const b = toActorLocal(st, pt);
        onTransientUpdateChart({
          ...init,
          width: Math.round(Math.max(180, init.width + 2 * (b.x - a.x))),
          height: Math.round(Math.max(120, init.height + 2 * (b.y - a.y))),
        });
      }

      // Drag one point of a drawn motion path
      else if (session.targetType === 'path-anchor' && session.initialPath && session.anchorIndex !== undefined) {
        const init = session.initialPath;
        const points = init.points.map((p, i) =>
          i === session.anchorIndex
            ? { x: Math.round(pt.x - session.offsetX), y: Math.round(pt.y - session.offsetY) }
            : p
        );
        onTransientUpdatePath({ ...init, points });
      }

      // Move a whole motion path
      else if (session.targetType === 'path-move' && session.initialPath) {
        const dx = Math.round(pt.x - session.startCanvasPt.x);
        const dy = Math.round(pt.y - session.startCanvasPt.y);
        const init = session.initialPath;
        onTransientUpdatePath({ ...init, points: init.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
      }

      // Motion path point drag: edits the key's position without changing the current frame
      else if (session.targetType === 'path-key' && session.keyFrame !== undefined && session.initialObj) {
        const obj = session.initialObj;
        const value = { x: Math.round(pt.x - session.offsetX), y: Math.round(pt.y - session.offsetY) };
        const position = setKeyframe(obj.tracks.position, session.keyFrame, value);
        transientAnimated(session.objectKind!, { ...obj, tracks: { ...obj.tracks, position } });
      }

      // Actor / chart / text drag: stopwatch rule (static value, or key at the current frame)
      else if (
        (session.targetType === 'actor' || session.targetType === 'chart' || session.targetType === 'text') &&
        session.initialObj
      ) {
        const pos = { x: Math.round(pt.x - session.offsetX), y: Math.round(pt.y - session.offsetY) };
        transientAnimated(session.targetType, setActorProperty(session.initialObj, 'position', currentFrame, pos));
      }
    },
    [
      getCanvasCoordinates,
      getCurrentSnapshot,
      currentFrame,
      onTransientUpdateFrameData,
      onTransientUpdateActor,
      onTransientUpdatePath,
      onTransientUpdateChart,
      onTransientUpdateText,
    ]
  );

  const onWindowMouseUp = useCallback(
    (e: MouseEvent) => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);

      const session = dragSessionRef.current;
      dragSessionRef.current = null;

      if (!session) return;

      // Same as mousemove: commit what the drag produced, not the pre-drag props of this closure
      const latest = getCurrentSnapshot();
      const currentFrameData = latest.frames[currentFrame] || emptyFrame(currentFrame);
      const { charts, texts, actors } = latest;

      // Only commit to history if the object was actually dragged!
      // This eliminates intermediate movements and guarantees 1-step undo!
      if (session.hasMoved) {
        if (session.targetType === 'joint') {
          onCommitFrameData(
            currentFrame,
            currentFrameData,
            t('stage.history.moveJoint'),
            session.baseSnapshot
          );
        } else if (session.targetType === 'stick') {
          onCommitFrameData(
            currentFrame,
            currentFrameData,
            t('stage.history.moveStick'),
            session.baseSnapshot
          );
        } else if (session.targetType === 'chart' || session.targetType === 'chart-resize') {
          const chart = charts.find((c) => c.id === session.targetId);
          if (chart) {
            onCommitChart(
              chart,
              session.targetType === 'chart-resize'
                ? t('stage.history.resizeChart')
                : t('stage.history.moveChart', { name: chart.title }),
              session.baseSnapshot
            );
          }
        } else if (session.targetType === 'text') {
          const txt = texts.find((t) => t.id === session.targetId);
          if (txt) {
            onCommitText(txt, t('stage.history.moveText', { name: txt.text }), session.baseSnapshot);
          }
        } else if (session.targetType === 'path-anchor' || session.targetType === 'path-move') {
          const path = latest.paths.find((p) => p.id === session.targetId);
          if (path) {
            onCommitPath(
              path,
              session.targetType === 'path-move'
                ? t('stage.history.movePath', { name: path.name })
                : t('stage.history.editPathPoint', { name: path.name }),
              session.baseSnapshot
            );
          }
        } else if (session.targetType === 'path-key' && session.objectKind) {
          const description = t('stage.history.editKeyPoint', { frame: session.keyFrame ?? 0 });
          const obj = findAnimated(session.objectKind, session.targetId, latest);
          if (obj && session.objectKind === 'actor') onCommitActor(obj as ActorOverlay, description, session.baseSnapshot);
          if (obj && session.objectKind === 'chart') onCommitChart(obj as ChartOverlay, description, session.baseSnapshot);
          if (obj && session.objectKind === 'text') onCommitText(obj as TextOverlay, description, session.baseSnapshot);
        } else if (session.targetType === 'actor') {
          const actor = actors.find((a) => a.id === session.targetId);
          if (actor) {
            onCommitActor(actor, t('stage.history.moveActor', { name: actor.name, frame: currentFrame }), session.baseSnapshot);
          }
        }
      }
    },
    [
      onWindowMouseMove,
      getCurrentSnapshot,
      currentFrame,
      onCommitFrameData,
      onCommitChart,
      onCommitText,
      onCommitActor,
      onCommitPath,
      t,
    ]
  );

  // Hidden or locked layers can't be picked or edited on the stage
  const isEditable = (targetId: string | undefined, type: 'drawing' | 'chart' | 'text' | 'actor' | 'path') => {
    const resolved = resolveObjectLayer(layers, targetId, type);
    return !resolved || (resolved.layer.visible && !resolved.layer.locked);
  };
  const isOnScreen = (item: { startFrame: number; durationFrames: number }) =>
    currentFrame >= item.startFrame && currentFrame <= item.startFrame + item.durationFrames;

  // ================= MOUSE DOWN: HIT TESTING & DRAG INITIATION =================
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(e);

    // 0. "Caminho" tool: each click adds a point; double click finishes
    if (activeTool === 'path') {
      if (e.detail >= 2) {
        finishDraftPath();
        return;
      }
      onSelectObject(null);
      setDraftPath((d) => [...(d ?? []), { x: Math.round(pt.x), y: Math.round(pt.y) }]);
      return;
    }

    // 1. Drawing Tool Mode (Pen, Line, Arrow, Rect, Circle, Eraser)
    if (
      activeTool === 'pen' ||
      activeTool === 'line' ||
      activeTool === 'arrow' ||
      activeTool === 'rect' ||
      activeTool === 'circle' ||
      activeTool === 'eraser'
    ) {
      if (!isEditable(undefined, 'drawing')) return;
      strokeBaseSnapshotRef.current = getCurrentSnapshot();

      if (activeTool === 'eraser') {
        // Erase strokes within 20px of click
        const remaining = currentFrameData.drawings.filter((stroke) => {
          if (!isEditable(stroke.groupId, 'drawing')) return true;
          const hit = stroke.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 22);
          return !hit;
        });
        if (remaining.length !== currentFrameData.drawings.length) {
          onCommitFrameData(
            currentFrame,
            { ...currentFrameData, drawings: remaining },
            t('stage.history.erase'),
            strokeBaseSnapshotRef.current
          );
        }
        return;
      }

      // Initialize drawing stroke
      setCurrentStroke({
        id: `stroke-${Date.now()}`,
        tool: activeTool,
        points: [pt],
        color: strokeColor,
        thickness: strokeThickness,
      });
      return;
    }

    // 2. Selection & Transform Mode (Pointer / Move)
    const baseSnapshot = getCurrentSnapshot();

    const selected = selectedAnimated();

    // 2A. Resize handle of the selected chart (bottom-right corner of its transformed box)
    if (selected?.kind === 'chart' && isEditable(selectedObject!.id, 'chart')) {
      const st = sampleActor(selected.obj, currentFrame, paths);
      const local = toActorLocal(st, pt);
      const { box } = selected;
      const handleDistance = Math.hypot(local.x - (box.x + box.width + 3), local.y - (box.y + box.height + 3));
      if (st.visible && handleDistance * (st.scale || 1) <= 14) {
        dragSessionRef.current = {
          targetType: 'chart-resize',
          targetId: selectedObject!.id,
          startCanvasPt: pt,
          baseSnapshot,
          hasMoved: false,
          initialChart: selected.obj as ChartOverlay,
          offsetX: 0,
          offsetY: 0,
        };
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }
    }

    // 2A'. Points of the selected drawn path (drag to reshape it)
    if (selectedObject?.type === 'path') {
      const path = paths.find((p) => p.id === selectedObject.id);
      const index = path?.points.findIndex((p) => Math.hypot(pt.x - p.x, pt.y - p.y) <= PATH_KEY_HIT_RADIUS) ?? -1;
      if (path && index !== -1 && isEditable(path.id, 'path')) {
        dragSessionRef.current = {
          targetType: 'path-anchor',
          targetId: path.id,
          anchorIndex: index,
          initialPath: path,
          startCanvasPt: pt,
          baseSnapshot,
          hasMoved: false,
          offsetX: pt.x - path.points[index].x,
          offsetY: pt.y - path.points[index].y,
        };
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }
    }

    // 2C''. Hit Test: key points of the selected object's motion path (edited in place, like AE)
    if (selected && !followedPath(selected.obj, paths)) {
      const obj = selected.obj;
      const id = selectedObject!.id;
      // A key point under the object's current position (e.g. holding after the last key) means
      // "drag the object": that must animate at the current frame, not edit an older key.
      const current = actorPropertyValue(obj, 'position', currentFrame, paths);
      const onAnchor = Math.hypot(pt.x - current.x, pt.y - current.y) <= PATH_KEY_HIT_RADIUS;
      const key = onAnchor
        ? undefined
        : obj.tracks.position?.find((k) => Math.hypot(pt.x - k.value.x, pt.y - k.value.y) <= PATH_KEY_HIT_RADIUS);
      if (key && (obj.tracks.position?.length ?? 0) >= 2 && isEditable(id, selected.kind)) {
        dragSessionRef.current = {
          targetType: 'path-key',
          targetId: id,
          objectKind: selected.kind,
          initialObj: obj,
          keyFrame: key.frame,
          startCanvasPt: pt,
          baseSnapshot,
          hasMoved: false,
          offsetX: pt.x - key.value.x,
          offsetY: pt.y - key.value.y,
        };
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }
    }

    // 2B. Hit Test: Stick Figure Joints (Priority)
    for (const stick of currentFrameData.stickFigures) {
      if (!isEditable(stick.id, 'drawing')) continue;
      for (const [jId, joint] of Object.entries(stick.joints)) {
        const worldJx = stick.x + joint.x * stick.scale;
        const worldJy = stick.y + joint.y * stick.scale;
        const hitRadius = jId === 'head' ? 24 : 14;

        if (Math.hypot(pt.x - worldJx, pt.y - worldJy) <= hitRadius) {
          onSelectObject({ type: 'stick', id: stick.id });
          dragSessionRef.current = {
            targetType: 'joint',
            targetId: stick.id,
            jointId: jId,
            startCanvasPt: pt,
            baseSnapshot,
            hasMoved: false,
            initialStick: { ...stick },
            offsetX: 0,
            offsetY: 0,
          };
          window.addEventListener('mousemove', onWindowMouseMove);
          window.addEventListener('mouseup', onWindowMouseUp);
          return;
        }
      }
    }

    // 2C. Hit Test: Stick Figure Body Bones & Torso
    for (const stick of currentFrameData.stickFigures) {
      if (!isEditable(stick.id, 'drawing')) continue;
      let hit = false;
      // Center anchor hit
      if (Math.hypot(pt.x - stick.x, pt.y - stick.y) <= 22) {
        hit = true;
      } else {
        // Test distance from cursor to any stick bone segment
        for (const bone of stick.bones) {
          const j1 = stick.joints[bone.from];
          const j2 = stick.joints[bone.to];
          if (j1 && j2) {
            const x1 = stick.x + j1.x * stick.scale;
            const y1 = stick.y + j1.y * stick.scale;
            const x2 = stick.x + j2.x * stick.scale;
            const y2 = stick.y + j2.y * stick.scale;
            if (distToSegment(pt.x, pt.y, x1, y1, x2, y2) <= 16) {
              hit = true;
              break;
            }
          }
        }
      }

      if (hit) {
        onSelectObject({ type: 'stick', id: stick.id });
        dragSessionRef.current = {
          targetType: 'stick',
          targetId: stick.id,
          startCanvasPt: pt,
          baseSnapshot,
          hasMoved: false,
          initialStick: { ...stick },
          offsetX: pt.x - stick.x,
          offsetY: pt.y - stick.y,
        };
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }
    }

    // 2C'. Hit Test: Actors, front-most layer first
    const actorDepth = (a: ActorOverlay) => {
      const i = layers.findIndex((l) => l.targetId === a.id);
      return i === -1 ? -1 : i;
    };
    const actorsFrontFirst = [...actors].sort((a, b) => actorDepth(a) - actorDepth(b));
    for (const actor of actorsFrontFirst) {
      if (!isEditable(actor.id, 'actor') || !hitTestActor(actor, currentFrame, pt, paths)) continue;
      const pos = actorPropertyValue(actor, 'position', currentFrame, paths);
      onSelectObject({ type: 'actor', id: actor.id });
      // Following a path: the position comes from the path (edit the path or the timing instead)
      if (followedPath(actor, paths)) return;
      dragSessionRef.current = {
        targetType: 'actor',
        targetId: actor.id,
        objectKind: 'actor',
        initialObj: actor,
        startCanvasPt: pt,
        baseSnapshot,
        hasMoved: false,
        offsetX: pt.x - pos.x,
        offsetY: pt.y - pos.y,
      };
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      return;
    }

    // 2C'''. Hit Test: drawn paths (click near the line selects it; dragging moves the whole path)
    for (const path of paths) {
      if (path.points.length < 2 || !isEditable(path.id, 'path')) continue;
      if (distanceToPath(samplePath(path), pt) > Math.max(8, path.style.width)) continue;
      onSelectObject({ type: 'path', id: path.id });
      dragSessionRef.current = {
        targetType: 'path-move',
        targetId: path.id,
        initialPath: path,
        startCanvasPt: pt,
        baseSnapshot,
        hasMoved: false,
        offsetX: 0,
        offsetY: 0,
      };
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      return;
    }

    // 2D. Hit Test: charts, then texts (top to bottom), through their animated transform
    const hitOverlay = (kind: 'chart' | 'text', obj: ChartOverlay | TextOverlay) => {
      if (!obj.visible || !isEditable(obj.id, kind)) return false;
      if (!hitTestBox(obj, boxOf(kind, obj), currentFrame, pt, paths)) return false;
      onSelectObject({ type: kind, id: obj.id });
      // Following a path: the position comes from the path (edit the path or the timing instead)
      if (followedPath(obj, paths)) return true;
      const pos = actorPropertyValue(obj, 'position', currentFrame, paths);
      dragSessionRef.current = {
        targetType: kind,
        targetId: obj.id,
        objectKind: kind,
        initialObj: obj,
        startCanvasPt: pt,
        baseSnapshot,
        hasMoved: false,
        offsetX: pt.x - pos.x,
        offsetY: pt.y - pos.y,
      };
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      return true;
    };
    for (let i = charts.length - 1; i >= 0; i--) if (hitOverlay('chart', charts[i])) return;
    for (let i = texts.length - 1; i >= 0; i--) if (hitOverlay('text', texts[i])) return;

    // Clicked on empty canvas background -> deselect
    onSelectObject(null);
  };

  // ================= MOUSE MOVE: DRAWING & HOVER FEEDBACK =================
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(e);

    // Update active freehand drawing stroke
    if (currentStroke) {
      setCurrentStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
      return;
    }
    if (draftPath) {
      setCursorPt(pt);
      return;
    }

    // Check hovered stick joints for cursor feedback
    if (activeTool === 'pointer' || activeTool === 'transform') {
      let foundHover: { stickId: string; jointId: string } | null = null;
      for (const stick of currentFrameData.stickFigures) {
        for (const joint of Object.values(stick.joints)) {
          const worldJx = stick.x + joint.x * stick.scale;
          const worldJy = stick.y + joint.y * stick.scale;
          const hitRadius = joint.id === 'head' ? 24 : 14;
          if (Math.hypot(pt.x - worldJx, pt.y - worldJy) <= hitRadius) {
            foundHover = { stickId: stick.id, jointId: joint.id };
            break;
          }
        }
        if (foundHover) break;
      }
      setHoveredJoint(foundHover);
    }
  };

  // ================= MOUSE UP: COMMIT DRAWING STROKE =================
  const handleMouseUp = () => {
    if (currentStroke) {
      if (currentStroke.points.length > 1 && strokeBaseSnapshotRef.current) {
        onCommitFrameData(
          currentFrame,
          {
            ...currentFrameData,
            drawings: [...currentFrameData.drawings, currentStroke],
          },
          t('stage.history.draw'),
          strokeBaseSnapshotRef.current
        );
      }
      setCurrentStroke(null);
      strokeBaseSnapshotRef.current = null;
    }
  };

  const hasSelection = selectedObject !== null;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full flex bg-neutral-950/90 select-none overflow-hidden"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        onImportImageFiles(e.dataTransfer.files);
      }}
    >
      {/* ================= FLASH CLASSIC TOOLBAR (LEFT) ================= */}
      <aside className="w-12 bg-neutral-950 border-r border-neutral-800 flex flex-col items-center py-2 gap-1.5 shrink-0 z-10">
        <button
          onClick={() => setActiveTool('pointer')}
          title={t('tool.pointer')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'pointer'
              ? 'bg-sky-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <MousePointer size={15} />
        </button>

        <button
          onClick={() => setActiveTool('transform')}
          title={t('tool.transform')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'transform'
              ? 'bg-sky-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Move size={15} />
        </button>

        <div className="w-6 h-[1px] bg-neutral-800 my-0.5" />

        <button
          onClick={() => setActiveTool('pen')}
          title={t('tool.pen')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'pen'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <PenTool size={15} />
        </button>

        <button
          onClick={() => setActiveTool('line')}
          title={t('tool.line')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'line'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Minus size={15} />
        </button>

        <button
          onClick={() => setActiveTool('arrow')}
          title={t('tool.arrow')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'arrow'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <MoveRight size={15} />
        </button>

        <button
          onClick={() => setActiveTool('rect')}
          title={t('tool.rect')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'rect'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Square size={15} />
        </button>

        <button
          onClick={() => setActiveTool('circle')}
          title={t('tool.circle')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'circle'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Circle size={15} />
        </button>

        <button
          onClick={() => setActiveTool('eraser')}
          title={t('tool.eraser')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'eraser'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Eraser size={15} />
        </button>

        <button
          onClick={() => setActiveTool('path')}
          title={t('tool.path')}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'path'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <RouteIcon size={15} />
        </button>

        <div className="w-6 h-[1px] bg-neutral-800 my-0.5" />

        {/* Color Swatch & Stroke Thickness */}
        <div className="flex flex-col items-center gap-1">
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            title={t('tool.strokeColor')}
            className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
          />
          <div className="flex flex-col gap-0.5">
            {[2, 4, 8].map((th) => (
              <button
                key={th}
                onClick={() => setStrokeThickness(th)}
                className={`w-5 h-1.5 rounded transition ${
                  strokeThickness === th ? 'bg-sky-400' : 'bg-neutral-700 hover:bg-neutral-500'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="w-6 h-[1px] bg-neutral-800 my-0.5" />

        {/* Onion Skin toggle */}
        <button
          onClick={() => setOnionSkinEnabled((prev) => !prev)}
          title={t('tool.onionSkin', { state: onionSkinEnabled ? t('tool.onionOn') : t('tool.onionOff') })}
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            onionSkinEnabled
              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
          }`}
        >
          <Eye size={14} />
        </button>
      </aside>

      {/* ================= CENTER FLASH STAGE ================= */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 overflow-auto relative">
        {/* Floating Context Toolbar when an object is selected */}
        {hasSelection && (
          <div className="absolute top-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/95 border border-sky-500/40 shadow-2xl backdrop-blur-md text-xs text-white">
            <span className="font-semibold text-sky-400 font-mono text-[11px] uppercase tracking-wider pr-1">
              {selectedObject?.type === 'stick'
                ? t('selection.stick')
                : selectedObject?.type === 'chart'
                ? t('selection.chart')
                : selectedObject?.type === 'text'
                ? t('selection.text')
                : selectedObject?.type === 'actor'
                ? t('selection.actor')
                : selectedObject?.type === 'path'
                ? t('selection.path')
                : t('selection.object')}
            </span>

            <div className="w-[1px] h-3.5 bg-neutral-700 mx-1" />

            {/* Flash Group / Ungroup Buttons */}
            <button
              onClick={onGroupSelected}
              title={t('selection.group')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
            >
              <Group size={12} className="text-sky-400" />
              <span>{t('selection.groupShort')}</span>
            </button>

            <button
              onClick={onUngroupSelected}
              title={t('selection.ungroup')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-neutral-800 text-amber-400 transition"
            >
              <Ungroup size={12} />
              <span>{t('selection.ungroupShort')}</span>
            </button>

            <div className="w-[1px] h-3.5 bg-neutral-700 mx-1" />

            {/* Delete Object */}
            <button
              onClick={() => {
                if (selectedObject?.type === 'chart') onDeleteChart(selectedObject.id);
                else if (selectedObject?.type === 'text') onDeleteText(selectedObject.id);
                else if (selectedObject?.type === 'stick') {
                  if (onDeleteStickFigure) {
                    onDeleteStickFigure(selectedObject.id, false);
                  } else {
                    const filtered = currentFrameData.stickFigures.filter(
                      (s) => s.id !== selectedObject.id
                    );
                    onUpdateFrameData(currentFrame, {
                      ...currentFrameData,
                      stickFigures: filtered,
                    });
                  }
                }
                onSelectObject(null);
              }}
              title={t('selection.delete')}
              className="p-1 rounded hover:bg-rose-950/60 text-neutral-400 hover:text-rose-400 transition"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Stage Viewport Container with Dynamic Aspect Ratio */}
        <div
          className="relative shadow-2xl rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 max-w-full"
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            maxHeight:
              zoomMode === 'fit'
                ? 'calc(100% - 20px)'
                : zoomMode === '75%'
                ? '75%'
                : zoomMode === '50%'
                ? '50%'
                : '100%',
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full block ${
              activeTool === 'pointer' || activeTool === 'transform'
                ? hoveredJoint
                  ? 'cursor-grab'
                  : 'cursor-default'
                : activeTool === 'eraser'
                ? 'cursor-cell'
                : 'cursor-crosshair'
            }`}
          />

          {/* Frame Number & Onion Skin Indicator */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 pointer-events-none">
            <span className="px-2.5 py-1 rounded bg-neutral-900/90 text-sky-400 font-mono text-xs font-semibold border border-neutral-700/60 backdrop-blur-sm shadow-md">
              FRAME {String(currentFrame).padStart(2, '0')} / {totalFrames}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-900/80 text-neutral-400 border border-neutral-800">
              {canvasWidth} × {canvasHeight}
            </span>
          </div>

          {/* Onion Skin Banner with Dismiss Button */}
          {onionSkinEnabled && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-800 text-[11px] font-medium backdrop-blur-sm shadow-lg">
              <span>{t('stage.onionBanner')}</span>
              <button
                onClick={() => setOnionSkinEnabled(false)}
                className="px-1.5 py-0.5 rounded bg-cyan-900 hover:bg-cyan-800 text-cyan-100 text-[10px]"
                title={t('stage.onionDisableHint')}
              >
                {t('stage.onionDisable')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
