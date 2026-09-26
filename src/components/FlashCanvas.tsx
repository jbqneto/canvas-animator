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
} from '../types';
import { hitTestActor, sampleActor, setActorProperty, actorPropertyValue } from '../engine/actor';
import { pathPolyline, samplePosition, setKeyframe } from '../engine/keyframes';
import { dragJointFK } from '../engine/stickRig';

const PATH_KEY_HIT_RADIUS = 9;
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
  activeTool: 'pointer' | 'transform' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'eraser';
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom control for stage canvas view
  const [zoomMode, setZoomMode] = useState<'fit' | '50%' | '75%' | '100%'>('fit');

  // Hover state for interactive stick joints
  const [hoveredJoint, setHoveredJoint] = useState<{
    stickId: string;
    jointId: string;
  } | null>(null);

  // Active freehand drawing stroke in progress
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  const strokeBaseSnapshotRef = useRef<HistorySnapshot | null>(null);

  // Drag Session tracking for mouse interaction
  const dragSessionRef = useRef<{
    targetType: 'stick' | 'joint' | 'chart' | 'chart-resize' | 'text' | 'actor' | 'path-key';
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
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const currentFrameData = frames[currentFrame] || {
    frameNumber: currentFrame,
    stickFigures: [],
    drawings: [],
    groups: [],
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
      { frames, charts, texts, images, actors, videoBg, videoElement, layers },
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

      // 3B. Chart Selection Bounding Box & 8 Flash Drag Handles
      charts.forEach((chart) => {
        if (!chart.visible) return;
        const isSelected =
          selectedObject?.type === 'chart' && selectedObject.id === chart.id;
        if (!isSelected) return;

        const cx = chart.x;
        const cy = chart.y;

        ctx.save();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 3, cy - 3, chart.width + 6, chart.height + 6);

        // Flash 8 Handles (Corners & Edges)
        const handles = [
          { x: cx - 3, y: cy - 3 },
          { x: cx + chart.width / 2, y: cy - 3 },
          { x: cx + chart.width + 3, y: cy - 3 },
          { x: cx - 3, y: cy + chart.height / 2 },
          { x: cx + chart.width + 3, y: cy + chart.height / 2 },
          { x: cx - 3, y: cy + chart.height + 3 },
          { x: cx + chart.width / 2, y: cy + chart.height + 3 },
          { x: cx + chart.width + 3, y: cy + chart.height + 3 },
        ];

        handles.forEach((h) => {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0ea5e9';
          ctx.lineWidth = 1.5;
          ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
          ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
        });

        ctx.restore();
      });

      // 3D. Actor selection: motion path + rotated box around the image at its animated position
      if (selectedObject?.type === 'actor') {
        const actor = actors.find((a) => a.id === selectedObject.id);
        const posTrack = actor?.tracks.position;
        if (actor && posTrack && posTrack.length >= 2) {
          ctx.save();
          // Path (motion guide)
          const line = pathPolyline(posTrack, actor.smoothPath);
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.75)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.setLineDash([]);
          // One dot per frame: spacing shows the speed (closer = slower), like AE
          ctx.fillStyle = 'rgba(253, 186, 116, 0.8)';
          for (let f = posTrack[0].frame; f <= posTrack[posTrack.length - 1].frame; f++) {
            const p = samplePosition(posTrack, f, actor.base, actor.smoothPath);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
          // Keyframe points (draggable)
          posTrack.forEach((k) => {
            const isCurrent = k.frame === currentFrame;
            ctx.beginPath();
            ctx.rect(k.value.x - 5, k.value.y - 5, 10, 10);
            ctx.fillStyle = isCurrent ? '#ffffff' : '#f97316';
            ctx.strokeStyle = '#09090b';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fdba74';
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`F${k.frame}`, k.value.x + 8, k.value.y - 8);
          });
          ctx.restore();
        }
        if (actor) {
          const st = sampleActor(actor, currentFrame);
          const w = actor.width * st.scale;
          const h = actor.height * st.scale;
          ctx.save();
          ctx.translate(st.x, st.y);
          ctx.rotate((st.rotation * Math.PI) / 180);
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 1.5;
          ctx.setLineDash(st.visible ? [] : [6, 4]);
          ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
          ctx.setLineDash([]);
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 3C. Text Selection Bounding Box
      texts.forEach((txt) => {
        if (!txt.visible) return;
        const isSelected =
          selectedObject?.type === 'text' && selectedObject.id === txt.id;
        if (!isSelected) return;

        const cx = txt.x;
        const cy = txt.y;
        const textWidth = Math.max(160, txt.text.length * (txt.fontSize * 0.55));
        const textHeight = txt.fontSize * 1.5;

        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(cx - 8, cy - textHeight + 6, textWidth + 16, textHeight + 14);
        ctx.setLineDash([]);

        ctx.fillStyle = '#10b981';
        ctx.fillRect(cx - 8, cy - textHeight + 6, 8, 8);
        ctx.restore();
      });
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
      const { charts, texts, actors } = latest;

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

      // Handle Chart Position Drag
      else if (session.targetType === 'chart') {
        const chart = charts.find((c) => c.id === session.targetId);
        if (chart) {
          const newX = Math.round(pt.x - session.offsetX);
          const newY = Math.round(pt.y - session.offsetY);
          onTransientUpdateChart({ ...chart, x: newX, y: newY });
        }
      }

      // Handle Chart Resize Corner Handle Drag
      else if (session.targetType === 'chart-resize' && session.initialChart) {
        const deltaX = pt.x - session.startCanvasPt.x;
        const deltaY = pt.y - session.startCanvasPt.y;
        const init = session.initialChart;

        let newW = Math.max(180, init.width + deltaX);
        let newH = Math.max(120, init.height + deltaY);

        onTransientUpdateChart({
          ...init,
          width: Math.round(newW),
          height: Math.round(newH),
        });
      }

      // Handle motion path point drag: edits the key's position without changing the current frame
      else if (session.targetType === 'path-key' && session.keyFrame !== undefined) {
        const actor = actors.find((a) => a.id === session.targetId);
        if (actor) {
          const value = { x: Math.round(pt.x - session.offsetX), y: Math.round(pt.y - session.offsetY) };
          const position = setKeyframe(actor.tracks.position, session.keyFrame, value);
          onTransientUpdateActor({ ...actor, tracks: { ...actor.tracks, position } });
        }
      }

      // Handle Actor Drag: stopwatch rule (static value, or key at the current frame)
      else if (session.targetType === 'actor') {
        const actor = actors.find((a) => a.id === session.targetId);
        if (actor) {
          const pos = { x: Math.round(pt.x - session.offsetX), y: Math.round(pt.y - session.offsetY) };
          onTransientUpdateActor(setActorProperty(actor, 'position', currentFrame, pos));
        }
      }

      // Handle Text Overlay Drag
      else if (session.targetType === 'text') {
        const txt = texts.find((t) => t.id === session.targetId);
        if (txt) {
          const newX = Math.round(pt.x - session.offsetX);
          const newY = Math.round(pt.y - session.offsetY);
          onTransientUpdateText({ ...txt, x: newX, y: newY });
        }
      }
    },
    [
      getCanvasCoordinates,
      getCurrentSnapshot,
      currentFrame,
      onTransientUpdateFrameData,
      onTransientUpdateActor,
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
            `Mover Articulação do Boneco`,
            session.baseSnapshot
          );
        } else if (session.targetType === 'stick') {
          onCommitFrameData(
            currentFrame,
            currentFrameData,
            `Mover Boneco Palito`,
            session.baseSnapshot
          );
        } else if (session.targetType === 'chart' || session.targetType === 'chart-resize') {
          const chart = charts.find((c) => c.id === session.targetId);
          if (chart) {
            onCommitChart(
              chart,
              session.targetType === 'chart-resize'
                ? `Redimensionar Gráfico`
                : `Mover Gráfico "${chart.title}"`,
              session.baseSnapshot
            );
          }
        } else if (session.targetType === 'text') {
          const txt = texts.find((t) => t.id === session.targetId);
          if (txt) {
            onCommitText(txt, `Mover Texto "${txt.text}"`, session.baseSnapshot);
          }
        } else if (session.targetType === 'path-key') {
          const actor = actors.find((a) => a.id === session.targetId);
          if (actor) {
            onCommitActor(actor, `Editar ponto do caminho (F${session.keyFrame})`, session.baseSnapshot);
          }
        } else if (session.targetType === 'actor') {
          const actor = actors.find((a) => a.id === session.targetId);
          if (actor) {
            onCommitActor(actor, `Mover "${actor.name}" (frame ${currentFrame})`, session.baseSnapshot);
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
    ]
  );

  // Hidden or locked layers can't be picked or edited on the stage
  const isEditable = (targetId: string | undefined, type: 'drawing' | 'chart' | 'text' | 'actor') => {
    const resolved = resolveObjectLayer(layers, targetId, type);
    return !resolved || (resolved.layer.visible && !resolved.layer.locked);
  };
  const isOnScreen = (item: { startFrame: number; durationFrames: number }) =>
    currentFrame >= item.startFrame && currentFrame <= item.startFrame + item.durationFrames;

  // ================= MOUSE DOWN: HIT TESTING & DRAG INITIATION =================
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(e);

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
            'Borracha no Canvas',
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

    // 2A. Check if clicking Chart Resize Handles (if chart is selected)
    if (selectedObject?.type === 'chart') {
      const activeChart = charts.find((c) => c.id === selectedObject.id);
      if (activeChart && activeChart.visible && isEditable(activeChart.id, 'chart')) {
        const cornerHandleX = activeChart.x + activeChart.width + 3;
        const cornerHandleY = activeChart.y + activeChart.height + 3;
        if (Math.hypot(pt.x - cornerHandleX, pt.y - cornerHandleY) <= 14) {
          dragSessionRef.current = {
            targetType: 'chart-resize',
            targetId: activeChart.id,
            startCanvasPt: pt,
            baseSnapshot,
            hasMoved: false,
            initialChart: { ...activeChart },
            offsetX: 0,
            offsetY: 0,
          };
          window.addEventListener('mousemove', onWindowMouseMove);
          window.addEventListener('mouseup', onWindowMouseUp);
          return;
        }
      }
    }

    // 2C''. Hit Test: key points of the selected actor's motion path (edited in place, like AE)
    if (selectedObject?.type === 'actor') {
      const actor = actors.find((a) => a.id === selectedObject.id);
      // A key point under the actor's current position (e.g. holding after the last key) means
      // "drag the object": that must animate at the current frame, not edit an older key.
      const current = actor ? actorPropertyValue(actor, 'position', currentFrame) : null;
      const onActorAnchor = !!current && Math.hypot(pt.x - current.x, pt.y - current.y) <= PATH_KEY_HIT_RADIUS;
      const key = onActorAnchor
        ? undefined
        : actor?.tracks.position?.find(
            (k) => Math.hypot(pt.x - k.value.x, pt.y - k.value.y) <= PATH_KEY_HIT_RADIUS
          );
      if (actor && key && (actor.tracks.position?.length ?? 0) >= 2 && isEditable(actor.id, 'actor')) {
        dragSessionRef.current = {
          targetType: 'path-key',
          targetId: actor.id,
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
      if (!isEditable(actor.id, 'actor') || !hitTestActor(actor, currentFrame, pt)) continue;
      const pos = actorPropertyValue(actor, 'position', currentFrame);
      onSelectObject({ type: 'actor', id: actor.id });
      dragSessionRef.current = {
        targetType: 'actor',
        targetId: actor.id,
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

    // 2D. Hit Test: Chart Overlays (Top to bottom)
    for (let i = charts.length - 1; i >= 0; i--) {
      const c = charts[i];
      if (!c.visible || !isOnScreen(c) || !isEditable(c.id, 'chart')) continue;
      if (pt.x >= c.x && pt.x <= c.x + c.width && pt.y >= c.y && pt.y <= c.y + c.height) {
        onSelectObject({ type: 'chart', id: c.id });
        dragSessionRef.current = {
          targetType: 'chart',
          targetId: c.id,
          startCanvasPt: pt,
          baseSnapshot,
          hasMoved: false,
          initialChart: { ...c },
          offsetX: pt.x - c.x,
          offsetY: pt.y - c.y,
        };
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }
    }

    // 2E. Hit Test: Text Overlays
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      if (!t.visible || !isOnScreen(t) || !isEditable(t.id, 'text')) continue;
      const textWidth = Math.max(160, t.text.length * (t.fontSize * 0.55));
      const textHeight = t.fontSize * 1.5;

      if (
        pt.x >= t.x - 8 &&
        pt.x <= t.x + textWidth + 8 &&
        pt.y >= t.y - textHeight + 6 &&
        pt.y <= t.y + 14
      ) {
        onSelectObject({ type: 'text', id: t.id });
        dragSessionRef.current = {
          targetType: 'text',
          targetId: t.id,
          startCanvasPt: pt,
          baseSnapshot,
          hasMoved: false,
          initialText: { ...t },
          offsetX: pt.x - t.x,
          offsetY: pt.y - t.y,
        };
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }
    }

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
          'Desenho no Canvas',
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
          title="Ferramenta de Seleção (V)"
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
          title="Transformação Livre / Mover Objetos (Q)"
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
          title="Pincel / Desenho Livre (B)"
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
          title="Linha / Palito Reto (N)"
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
          title="Seta Indicadora (A)"
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
          title="Retângulo (R)"
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
          title="Círculo / Oval (O)"
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
          title="Borracha (E)"
          className={`w-8 h-8 rounded flex items-center justify-center transition ${
            activeTool === 'eraser'
              ? 'bg-sky-500 text-neutral-950 shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Eraser size={15} />
        </button>

        <div className="w-6 h-[1px] bg-neutral-800 my-0.5" />

        {/* Color Swatch & Stroke Thickness */}
        <div className="flex flex-col items-center gap-1">
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            title="Cor do Traço"
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
          title={`Papel Vegetal (Onion Skin): ${
            onionSkinEnabled ? 'Ativo (Mostrando quadro anterior)' : 'Desativado'
          }`}
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
                ? 'Boneco Palito'
                : selectedObject?.type === 'chart'
                ? 'Gráfico'
                : selectedObject?.type === 'text'
                ? 'Texto'
                : 'Objeto'}
            </span>

            <div className="w-[1px] h-3.5 bg-neutral-700 mx-1" />

            {/* Flash Group / Ungroup Buttons */}
            <button
              onClick={onGroupSelected}
              title="Agrupar objetos (Ctrl+G)"
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
            >
              <Group size={12} className="text-sky-400" />
              <span>Agrupar</span>
            </button>

            <button
              onClick={onUngroupSelected}
              title="Desagrupar em traços individuais (Ctrl+B)"
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-neutral-800 text-amber-400 transition"
            >
              <Ungroup size={12} />
              <span>Desagrupar</span>
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
              title="Excluir Objeto (Delete)"
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
              <span>Papel Vegetal Ativo (Mostrando quadro anterior)</span>
              <button
                onClick={() => setOnionSkinEnabled(false)}
                className="px-1.5 py-0.5 rounded bg-cyan-900 hover:bg-cyan-800 text-cyan-100 text-[10px]"
                title="Desativar Onion Skin"
              >
                Desativar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
