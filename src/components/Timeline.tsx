import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Copy,
  Trash2,
  Plus,
  Layers,
  BarChart3,
  Type,
  User,
  Video,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  PenTool,
  Group,
  Clock,
  Sparkles,
  MoveHorizontal,
  Image as ImageIcon,
} from 'lucide-react';
import { isTypingTarget } from '../utils/keyboard';
import {
  FrameData,
  ChartOverlay,
  TextOverlay,
  ImageOverlay,
  StudioLayer,
  SelectedObjectRef,
  HistorySnapshot,
  ActorOverlay,
} from '../types';
import { actorKeyframes, moveActorKeys, shiftActorTime } from '../engine/actor';

type ClipType = 'chart' | 'text' | 'actor';
type ClipMode = 'move' | 'trim-start' | 'trim-end';
const MIN_CLIP_FRAMES = 5;

interface TimelineProps {
  currentFrame: number;
  setCurrentFrame: (frame: number | ((prev: number) => number)) => void;
  totalFrames: number;
  setTotalFrames: (total: number) => void;
  fps: number;
  setFps: (fps: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  isLooping: boolean;
  setIsLooping: (loop: boolean | ((prev: boolean) => boolean)) => void;
  frames: Record<number, FrameData>;
  onDuplicateCurrentFrame: () => void;
  onClearCurrentFrame: () => void;
  // Layers & Overlays
  layers: StudioLayer[];
  onAddLayer: (type: 'drawing' | 'chart' | 'text' | 'video' | 'group') => void;
  onDeleteLayer: (layerId: string) => void;
  onToggleLayerVisible: (layerId: string) => void;
  onToggleLayerLock: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: 'up' | 'down') => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  // Overlays
  charts: ChartOverlay[];
  texts: TextOverlay[];
  images: ImageOverlay[];
  selectedObject: SelectedObjectRef | null;
  onSelectObject: (ref: SelectedObjectRef | null) => void;
  // Timeline Trimming & Position Control
  onUpdateChart?: (chart: ChartOverlay) => void;
  onUpdateText?: (text: TextOverlay) => void;
  onCommitChart?: (chart: ChartOverlay, description: string, baseSnapshot: HistorySnapshot) => void;
  onCommitText?: (text: TextOverlay, description: string, baseSnapshot: HistorySnapshot) => void;
  getCurrentSnapshot?: () => HistorySnapshot;
  onJumpToFrame?: (frame: number) => void;
  actors: ActorOverlay[];
  onUpdateActor: (actor: ActorOverlay) => void;
  onCommitActor: (actor: ActorOverlay, description: string, baseSnapshot: HistorySnapshot) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  currentFrame,
  setCurrentFrame,
  totalFrames,
  setTotalFrames,
  fps,
  setFps,
  isPlaying,
  setIsPlaying,
  isLooping,
  setIsLooping,
  frames,
  onDuplicateCurrentFrame,
  onClearCurrentFrame,
  layers,
  onAddLayer,
  onDeleteLayer,
  onToggleLayerVisible,
  onToggleLayerLock,
  onMoveLayer,
  onRenameLayer,
  selectedLayerId,
  onSelectLayer,
  charts,
  texts,
  images,
  selectedObject,
  onSelectObject,
  onUpdateChart,
  onUpdateText,
  onCommitChart,
  onCommitText,
  getCurrentSnapshot,
  onJumpToFrame,
  actors,
  onUpdateActor,
  onCommitActor,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Active clip dragging session on the timeline
  const [activeClipDrag, setActiveClipDrag] = useState<{
    type: ClipType;
    id: string;
    mode: ClipMode;
    startClientX: number;
    initialStartFrame: number;
    initialDuration: number;
    /** Actor as it was when the drag started: keys are shifted from it, not cumulatively. */
    initialActor?: ActorOverlay;
    trackWidth: number;
    baseSnapshot?: HistorySnapshot;
    hasMoved: boolean;
  } | null>(null);

  // Keyframe diamond drag (retime keys); a click without movement just jumps to the frame
  const [keyDrag, setKeyDrag] = useState<{
    actor: ActorOverlay;
    fromFrame: number;
    startClientX: number;
    trackWidth: number;
    baseSnapshot?: HistorySnapshot;
    toFrame: number;
  } | null>(null);

  useEffect(() => {
    if (!keyDrag) return;
    const drag = keyDrag;
    const onMove = (e: MouseEvent) => {
      const delta = Math.round((e.clientX - drag.startClientX) * (totalFrames / drag.trackWidth));
      const to = Math.max(1, Math.min(totalFrames, drag.fromFrame + delta));
      if (to === drag.toFrame) return;
      drag.toFrame = to;
      onUpdateActor(moveActorKeys(drag.actor, drag.fromFrame, to));
      setCurrentFrame(to);
    };
    const onUp = () => {
      if (drag.toFrame !== drag.fromFrame && drag.baseSnapshot) {
        onCommitActor(
          moveActorKeys(drag.actor, drag.fromFrame, drag.toFrame),
          `Mover keyframe ${drag.fromFrame} → ${drag.toFrame}`,
          drag.baseSnapshot
        );
      } else {
        setCurrentFrame(drag.fromFrame);
      }
      setKeyDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [keyDrag, totalFrames, onUpdateActor, onCommitActor, setCurrentFrame]);

  // Close "+ Camada" dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setAddMenuOpen(false);
      }
    };
    if (addMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [addMenuOpen]);

  // Playback clock lives in App (synced with the background video)

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setCurrentFrame((f) => Math.min(totalFrames, f + 1));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setCurrentFrame((f) => Math.max(1, f - 1));
      } else if (e.code === 'KeyF' && e.ctrlKey) {
        e.preventDefault();
        onDuplicateCurrentFrame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalFrames, setCurrentFrame, setIsPlaying, onDuplicateCurrentFrame]);

  // Timecode calculation
  const totalSeconds = Math.floor((currentFrame - 1) / fps);
  const remainingFrames = (currentFrame - 1) % fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timecode = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}:${String(remainingFrames).padStart(2, '0')}`;

  // Handle scrub click/drag on the timeline ruler
  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    // If a clip is being dragged, don't scrub
    if (activeClipDrag) return;
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetFrame = Math.max(1, Math.min(totalFrames, Math.round(pct * totalFrames) || 1));
    setCurrentFrame(targetFrame);
  };

  // ================= DRAG & RESIZE TIMELINE CLIP HANDLERS =================
  const startClipDrag = (
    e: React.MouseEvent,
    type: ClipType,
    id: string,
    mode: ClipMode,
    startFrame: number,
    durationFrames: number
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const trackWidth = tracksContainerRef.current?.getBoundingClientRect().width || 800;
    const baseSnapshot = getCurrentSnapshot ? getCurrentSnapshot() : undefined;

    setActiveClipDrag({
      type,
      id,
      mode,
      startClientX: e.clientX,
      initialStartFrame: startFrame,
      initialDuration: durationFrames,
      initialActor: type === 'actor' ? actors.find((a) => a.id === id) : undefined,
      trackWidth,
      baseSnapshot,
      hasMoved: false,
    });
  };

  // Window mouse move & up listeners for timeline clip trimming/moving
  useEffect(() => {
    if (!activeClipDrag) return;
    const drag = activeClipDrag;

    // New [start, duration] for the clip, kept inside the timeline and at least MIN_CLIP_FRAMES long
    const computeSpan = (deltaFrames: number) => {
      const { initialStartFrame: start0, initialDuration: dur0 } = drag;
      if (drag.mode === 'trim-end') {
        const durationFrames = Math.max(MIN_CLIP_FRAMES, Math.min(totalFrames - start0 + 1, dur0 + deltaFrames));
        return { startFrame: start0, durationFrames };
      }
      if (drag.mode === 'trim-start') {
        const maxStart = start0 + dur0 - MIN_CLIP_FRAMES;
        const startFrame = Math.max(1, Math.min(maxStart, start0 + deltaFrames));
        return { startFrame, durationFrames: dur0 - (startFrame - start0) };
      }
      const maxStart = Math.max(1, totalFrames - dur0 + 1);
      return { startFrame: Math.max(1, Math.min(maxStart, start0 + deltaFrames)), durationFrames: dur0 };
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      const deltaPx = e.clientX - drag.startClientX;
      const deltaFrames = Math.round(deltaPx * (totalFrames / drag.trackWidth));
      if (Math.abs(deltaFrames) > 0) drag.hasMoved = true;
      const span = computeSpan(deltaFrames);

      if (drag.type === 'chart') {
        const chart = charts.find((c) => c.id === drag.id);
        if (chart && onUpdateChart) onUpdateChart({ ...chart, ...span });
      } else if (drag.type === 'text') {
        const txt = texts.find((t) => t.id === drag.id);
        if (txt && onUpdateText) onUpdateText({ ...txt, ...span });
      } else if (drag.type === 'actor' && drag.initialActor) {
        // Moving the clip moves its keys too; trimming only changes the visible span
        const moved =
          drag.mode === 'move'
            ? shiftActorTime(drag.initialActor, span.startFrame - drag.initialStartFrame)
            : { ...drag.initialActor, ...span };
        onUpdateActor(moved);
      }
    };

    const onWindowMouseUp = () => {
      if (drag.hasMoved && drag.baseSnapshot) {
        const verb = drag.mode === 'move' ? 'Mover' : 'Ajustar duração de';
        if (drag.type === 'chart' && onCommitChart) {
          const chart = charts.find((c) => c.id === drag.id);
          if (chart) onCommitChart(chart, `${verb} Gráfico na Linha do Tempo`, drag.baseSnapshot);
        } else if (drag.type === 'text' && onCommitText) {
          const txt = texts.find((t) => t.id === drag.id);
          if (txt) onCommitText(txt, `${verb} Texto na Linha do Tempo`, drag.baseSnapshot);
        } else if (drag.type === 'actor') {
          const actor = actors.find((a) => a.id === drag.id);
          if (actor) onCommitActor(actor, `${verb} "${actor.name}" na Linha do Tempo`, drag.baseSnapshot);
        }
      }
      setActiveClipDrag(null);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [
    activeClipDrag,
    charts,
    texts,
    actors,
    totalFrames,
    onUpdateChart,
    onUpdateText,
    onUpdateActor,
    onCommitChart,
    onCommitText,
    onCommitActor,
  ]);

  const getLayerIcon = (type: string) => {
    switch (type) {
      case 'chart':
        return <BarChart3 size={13} className="text-sky-400" />;
      case 'text':
        return <Type size={13} className="text-emerald-400" />;
      case 'video':
        return <Video size={13} className="text-purple-400" />;
      case 'group':
        return <Group size={13} className="text-amber-400" />;
      case 'actor':
        return <ImageIcon size={13} className="text-orange-400" />;
      case 'drawing':
      default:
        return <PenTool size={13} className="text-pink-400" />;
    }
  };

  return (
    <div className="w-full h-full bg-neutral-950 border-t border-neutral-800 flex flex-col select-none text-xs">
      {/* Top Transport & Controls Bar */}
      <div className="h-10 px-3 border-b border-neutral-800 flex items-center justify-between gap-3 bg-neutral-900 shrink-0">
        {/* Left: Timecode & Transport */}
        <div className="flex items-center gap-2">
          <div className="font-mono text-xs font-bold text-sky-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 tracking-wider">
            {timecode}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              id="timeline-prev-frame-btn"
              onClick={() => setCurrentFrame((f) => Math.max(1, f - 1))}
              title="Frame Anterior (Seta Esquerda)"
              className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
            >
              <SkipBack size={14} />
            </button>

            <button
              id="timeline-play-btn"
              onClick={() => setIsPlaying((p) => !p)}
              title="Play/Pause (Espaço)"
              className="w-7 h-7 rounded-full bg-sky-500 hover:bg-sky-400 text-neutral-950 flex items-center justify-center font-bold shadow-md shadow-sky-500/20 transition active:scale-95"
            >
              {isPlaying ? (
                <Pause size={13} fill="currentColor" />
              ) : (
                <Play size={13} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              id="timeline-next-frame-btn"
              onClick={() => setCurrentFrame((f) => Math.min(totalFrames, f + 1))}
              title="Próximo Frame (Seta Direita)"
              className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
            >
              <SkipForward size={14} />
            </button>

            <button
              id="timeline-loop-btn"
              onClick={() => setIsLooping((l) => !l)}
              title="Repetir Loop"
              className={`p-1 rounded transition ${
                isLooping
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'hover:bg-neutral-800 text-neutral-400'
              }`}
            >
              <Repeat size={13} />
            </button>
          </div>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Current Frame indicator badge */}
          <span className="text-[11px] font-mono text-neutral-300">
            Frame <span className="text-sky-400 font-bold">{currentFrame}</span> / {totalFrames}
          </span>
        </div>

        {/* Center: Keyframe & Duplication Controls */}
        <div className="flex items-center gap-1.5">
          <button
            id="timeline-duplicate-frame-btn"
            onClick={onDuplicateCurrentFrame}
            title="Copiar pose do frame atual para o próximo (ideal para animação fluida passo-a-passo)"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition font-medium text-[11px]"
          >
            <Copy size={12} />
            Duplicar Pose (F6)
          </button>

          <button
            id="timeline-clear-frame-btn"
            onClick={onClearCurrentFrame}
            title="Limpar desenhos e palitos do frame atual"
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-950/40 text-neutral-400 hover:text-rose-300 border border-transparent hover:border-rose-800/40 transition text-[11px]"
          >
            <Trash2 size={12} />
            Limpar Frame
          </button>
        </div>

        {/* Right: FPS & Total Frames Duration */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-neutral-400 text-[11px]">FPS:</span>
            <div className="flex bg-neutral-950 rounded p-0.5 border border-neutral-800">
              {[12, 24, 30, 60].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setFps(rate)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                    fps === rate
                      ? 'bg-sky-500 text-neutral-950 font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {rate}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-neutral-400 text-[11px]">Frames:</span>
            <input
              type="number"
              min="24"
              max="240"
              step="12"
              value={totalFrames}
              onChange={(e) =>
                setTotalFrames(Math.max(24, Math.min(240, Number(e.target.value))))
              }
              className="w-14 bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-center font-mono text-neutral-200 focus:border-sky-500 outline-none text-[11px]"
            />
          </div>
        </div>
      </div>

      {/* Main Timeline Workspace: Left Layers Panel + Right Keyframe Tracks */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* ================= LEFT: FLASH LAYERS PANEL ================= */}
        <div className="w-80 bg-neutral-950 border-r border-neutral-800 flex flex-col shrink-0">
          {/* Layers Header & Quick Add Buttons */}
          <div className="h-8 px-2.5 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between text-[10px] text-neutral-300 font-semibold shrink-0">
            <div className="flex items-center gap-1.5">
              <Layers size={13} className="text-sky-400" />
              <span>Camadas ({layers.length})</span>
            </div>

            {/* Quick Add Buttons & Dropdown Menu */}
            <div className="flex items-center gap-1" ref={menuContainerRef}>
              {/* Quick Add Buttons for instantaneous 1-click creation */}
              <button
                onClick={() => onAddLayer('chart')}
                title="Adicionar Novo Gráfico Animado"
                className="px-1.5 py-0.5 rounded bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-[10px] font-medium flex items-center gap-1 transition"
              >
                <BarChart3 size={11} />
                <span>+ Gráfico</span>
              </button>

              <button
                onClick={() => onAddLayer('text')}
                title="Adicionar Novo Texto Cinético / Contador"
                className="px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium flex items-center gap-1 transition"
              >
                <Type size={11} />
                <span>+ Texto</span>
              </button>

              <button
                onClick={() => onAddLayer('group')}
                title="Adicionar Novo Boneco Palito"
                className="px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-medium flex items-center gap-1 transition"
              >
                <User size={11} />
                <span>+ Boneco</span>
              </button>

              {/* Dropdown Menu Toggle */}
              <div className="relative">
                <button
                  id="timeline-add-layer-dropdown-btn"
                  onClick={() => setAddMenuOpen((prev) => !prev)}
                  title="Menu de Todas as Camadas"
                  className={`p-1 rounded transition border ${
                    addMenuOpen
                      ? 'bg-neutral-700 text-white border-sky-500'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
                  }`}
                >
                  <Plus size={12} />
                </button>

                {/* Dropdown rendered downward with high z-index to avoid clipping */}
                {addMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl py-1.5 z-50 space-y-0.5">
                    <div className="px-2.5 py-1 text-[9px] font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-800 mb-1">
                      Adicionar Nova Camada
                    </div>
                    <button
                      onClick={() => {
                        onAddLayer('chart');
                        setAddMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-neutral-800 text-left text-neutral-200 text-xs transition"
                    >
                      <BarChart3 size={14} className="text-sky-400" />
                      <div>
                        <div className="font-medium text-white">Camada de Gráfico</div>
                        <div className="text-[10px] text-neutral-400">Barras, rosca, linha e métricas</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        onAddLayer('text');
                        setAddMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-neutral-800 text-left text-neutral-200 text-xs transition"
                    >
                      <Type size={14} className="text-emerald-400" />
                      <div>
                        <div className="font-medium text-white">Camada de Texto / Contador</div>
                        <div className="text-[10px] text-neutral-400">Texto cinético e contador numérico</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        onAddLayer('group');
                        setAddMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-neutral-800 text-left text-neutral-200 text-xs transition"
                    >
                      <User size={14} className="text-amber-400" />
                      <div>
                        <div className="font-medium text-white">Camada de Boneco Palito</div>
                        <div className="text-[10px] text-neutral-400">Boneco articulado e poses</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        onAddLayer('drawing');
                        setAddMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-neutral-800 text-left text-neutral-200 text-xs transition"
                    >
                      <PenTool size={14} className="text-pink-400" />
                      <div>
                        <div className="font-medium text-white">Camada de Desenho Livre</div>
                        <div className="text-[10px] text-neutral-400">Caneta e traços manuais</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        onAddLayer('video');
                        setAddMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-neutral-800 text-left text-neutral-200 text-xs transition"
                    >
                      <Video size={14} className="text-purple-400" />
                      <div>
                        <div className="font-medium text-white">Camada de Fundo de Vídeo</div>
                        <div className="text-[10px] text-neutral-400">Cenário de fundo</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Layer Rows List */}
          <div className="flex-1 overflow-y-auto">
            {layers.map((layer, index) => {
              const isSelected = selectedLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  onClick={() => {
                    onSelectLayer(layer.id);
                    if (layer.targetId) {
                      if (layer.type === 'chart') {
                        onSelectObject({ type: 'chart', id: layer.targetId });
                      } else if (layer.type === 'text') {
                        onSelectObject({ type: 'text', id: layer.targetId });
                      } else if (layer.type === 'group') {
                        onSelectObject({ type: 'stick', id: layer.targetId });
                      } else if (layer.type === 'actor') {
                        onSelectObject({ type: 'actor', id: layer.targetId });
                      }
                    }
                  }}
                  className={`h-8 px-2.5 border-b border-neutral-900 flex items-center justify-between transition cursor-pointer ${
                    isSelected
                      ? 'bg-sky-950/40 border-l-2 border-l-sky-400'
                      : 'hover:bg-neutral-900/50'
                  }`}
                >
                  {/* Layer Icon & Name */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    {getLayerIcon(layer.type)}

                    {editingLayerId === layer.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => {
                          if (editingName.trim()) {
                            onRenameLayer(layer.id, editingName.trim());
                          }
                          setEditingLayerId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (editingName.trim()) {
                              onRenameLayer(layer.id, editingName.trim());
                            }
                            setEditingLayerId(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-neutral-900 border border-sky-500 rounded px-1 text-xs text-white outline-none w-28"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingLayerId(layer.id);
                          setEditingName(layer.name);
                        }}
                        title="Clique duplo para renomear"
                        className={`truncate text-[11px] select-none ${
                          isSelected ? 'font-semibold text-white' : 'text-neutral-300'
                        }`}
                      >
                        {layer.name}
                      </span>
                    )}
                  </div>

                  {/* Actions: Visibility, Lock, Reorder, Delete */}
                  <div className="flex items-center gap-0.5 shrink-0 text-neutral-400">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLayerVisible(layer.id);
                      }}
                      title={layer.visible ? 'Ocultar Camada' : 'Exibir Camada'}
                      className={`p-1 rounded hover:bg-neutral-800 transition ${
                        !layer.visible ? 'text-neutral-600' : 'text-neutral-300 hover:text-white'
                      }`}
                    >
                      {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLayerLock(layer.id);
                      }}
                      title={layer.locked ? 'Desbloquear Camada' : 'Bloquear Camada'}
                      className={`p-1 rounded hover:bg-neutral-800 transition ${
                        layer.locked ? 'text-amber-400' : 'text-neutral-500 hover:text-white'
                      }`}
                    >
                      {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>

                    <button
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveLayer(layer.id, 'up');
                      }}
                      title="Mover para Cima"
                      className="p-1 rounded hover:bg-neutral-800 disabled:opacity-20 text-neutral-400 hover:text-white transition"
                    >
                      <ChevronUp size={12} />
                    </button>

                    <button
                      disabled={index === layers.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveLayer(layer.id, 'down');
                      }}
                      title="Mover para Baixo"
                      className="p-1 rounded hover:bg-neutral-800 disabled:opacity-20 text-neutral-400 hover:text-white transition"
                    >
                      <ChevronDown size={12} />
                    </button>

                    {layers.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLayer(layer.id);
                        }}
                        title="Excluir Camada"
                        className="p-1 rounded hover:bg-rose-950/40 text-neutral-500 hover:text-rose-400 transition ml-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= RIGHT: KEYFRAME RULER & TRACKS ================= */}
        <div
          ref={tracksContainerRef}
          className="flex-1 flex flex-col min-w-0 bg-neutral-950 overflow-x-auto relative"
        >
          {/* Frame Number Ruler */}
          <div
            ref={rulerRef}
            onClick={handleTimelineScrub}
            className="h-8 border-b border-neutral-800 bg-neutral-900/70 relative cursor-pointer select-none shrink-0"
          >
            {/* Number Ticks */}
            <div className="absolute inset-0 flex">
              {Array.from({ length: totalFrames }).map((_, i) => {
                const fNum = i + 1;
                const isFifth = fNum % 5 === 0;
                const isTenth = fNum % 10 === 0;
                const isFirst = fNum === 1;

                return (
                  <div
                    key={fNum}
                    style={{ width: `${100 / totalFrames}%` }}
                    className={`h-full border-r flex flex-col justify-between shrink-0 relative ${
                      isTenth
                        ? 'border-neutral-700'
                        : isFifth
                        ? 'border-neutral-800'
                        : 'border-neutral-900/60'
                    }`}
                  >
                    {(isFifth || isFirst) && (
                      <span
                        className={`text-[9px] font-mono pl-1 pt-0.5 select-none leading-none ${
                          isTenth ? 'text-sky-400 font-bold' : 'text-neutral-400'
                        }`}
                      >
                        {fNum}
                      </span>
                    )}
                    <div
                      className={`w-full ${
                        isTenth
                          ? 'h-2.5 bg-sky-500/60'
                          : isFifth
                          ? 'h-2 bg-neutral-600'
                          : fNum % 2 === 0
                          ? 'h-1 bg-neutral-800'
                          : 'h-0.5 bg-neutral-800/40'
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Red Playhead Scrubber in Ruler */}
            <div
              style={{
                left: `${((currentFrame - 1) / totalFrames) * 100}%`,
              }}
              className="absolute top-0 bottom-0 w-4 -ml-2 pointer-events-none z-30 flex flex-col items-center"
            >
              <div className="w-3.5 h-3 bg-red-500 rounded-b shadow-lg shadow-red-500/50 flex items-center justify-center text-[7px] font-mono text-white font-bold">
                ▼
              </div>
              <div className="w-0.5 flex-1 bg-red-500 shadow-sm shadow-red-500/60" />
            </div>
          </div>

          {/* Keyframe Tracks Corresponding to Each Layer */}
          <div
            onClick={handleTimelineScrub}
            className="flex-1 overflow-y-auto relative cursor-pointer"
          >
            {/* Vertical Red Playhead Line extending down all tracks */}
            <div
              style={{
                left: `${((currentFrame - 1) / totalFrames) * 100}%`,
              }}
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
            />

            {/* Render a row for each layer */}
            {layers.map((layer) => {
              const isSelected = selectedLayerId === layer.id;

              // Find associated overlay if any
              const chart =
                layer.type === 'chart'
                  ? charts.find((c) => c.id === layer.targetId)
                  : null;
              const text =
                layer.type === 'text'
                  ? texts.find((t) => t.id === layer.targetId)
                  : null;
              const actor =
                layer.type === 'actor'
                  ? actors.find((a) => a.id === layer.targetId)
                  : null;

              return (
                <div
                  key={layer.id}
                  className={`h-8 border-b border-neutral-900 flex items-center relative transition ${
                    isSelected ? 'bg-sky-950/20' : 'hover:bg-neutral-900/30'
                  }`}
                >
                  {/* 1. Underlying grid columns */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {Array.from({ length: totalFrames }).map((_, i) => {
                      const fNum = i + 1;
                      const isTenth = fNum % 10 === 0;
                      return (
                        <div
                          key={fNum}
                          style={{ width: `${100 / totalFrames}%` }}
                          className={`h-full border-r ${
                            isTenth
                              ? 'border-neutral-800/80 bg-neutral-900/20'
                              : 'border-neutral-900/50'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* 2A. VISIBLE INTERACTIVE CLIP SPAN FOR CHART OVERLAYS */}
                  {chart && (
                    <div
                      style={{
                        left: `${((chart.startFrame - 1) / totalFrames) * 100}%`,
                        width: `${Math.max(
                          2,
                          (chart.durationFrames / totalFrames) * 100
                        )}%`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLayer(layer.id);
                        onSelectObject({ type: 'chart', id: chart.id });
                        if (
                          currentFrame < chart.startFrame ||
                          currentFrame > chart.startFrame + chart.durationFrames
                        ) {
                          setCurrentFrame(chart.startFrame);
                        }
                      }}
                      onMouseDown={(e) =>
                        startClipDrag(
                          e,
                          'chart',
                          chart.id,
                          'move',
                          chart.startFrame,
                          chart.durationFrames
                        )
                      }
                      title={`Gráfico: "${chart.title}" | Início: Frame ${
                        chart.startFrame
                      } | Fim: Frame ${
                        chart.startFrame + chart.durationFrames
                      } | Duração: ${chart.durationFrames} frames (${(
                        chart.durationFrames / fps
                      ).toFixed(
                        1
                      )}s)\n💡 Dica: Arraste a borda direita para estender a duração até 120 frames para uma animação duas vezes mais suave!`}
                      className={`absolute top-1 bottom-1 rounded z-10 flex items-center justify-between px-1 select-none shadow-md border group cursor-grab active:cursor-grabbing transition-all ${
                        selectedObject?.type === 'chart' &&
                        selectedObject.id === chart.id
                          ? 'bg-gradient-to-r from-sky-600/80 to-blue-600/80 border-sky-300 text-white ring-1 ring-sky-400'
                          : 'bg-gradient-to-r from-sky-950/90 to-blue-950/90 border-sky-500/60 text-sky-200 hover:border-sky-400'
                      }`}
                    >
                      {/* Left Trim Handle (Start Frame) */}
                      <div
                        onMouseDown={(e) =>
                          startClipDrag(
                            e,
                            'chart',
                            chart.id,
                            'trim-start',
                            chart.startFrame,
                            chart.durationFrames
                          )
                        }
                        title="Arraste para alterar o Frame Inicial"
                        className="h-full w-2.5 flex items-center justify-center cursor-col-resize hover:bg-white/30 rounded-l -ml-1 text-[8px] font-mono text-sky-300"
                      >
                        ▌
                      </div>

                      {/* Clip Label and Indicators */}
                      <div className="flex items-center gap-1.5 overflow-hidden mx-1 pointer-events-none">
                        <BarChart3 size={11} className="shrink-0 text-sky-300" />
                        <span className="text-[10px] font-bold truncate">
                          {chart.title}
                        </span>

                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/50 text-sky-200 shrink-0 border border-sky-500/30">
                          F{chart.startFrame} ➔ F{chart.startFrame + chart.durationFrames} (
                          {chart.durationFrames}f)
                        </span>

                        {chart.hasMotionTween && (
                          <span className="text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 flex items-center gap-0.5">
                            ◆ ➔ ◆ P1➔P2
                          </span>
                        )}
                      </div>

                      {/* Right Trim Handle (End Frame / Duration) */}
                      <div
                        onMouseDown={(e) =>
                          startClipDrag(
                            e,
                            'chart',
                            chart.id,
                            'trim-end',
                            chart.startFrame,
                            chart.durationFrames
                          )
                        }
                        title="Arraste para estender ou encurtar a duração (ex: 60 ou 120 frames)"
                        className="h-full w-3 flex items-center justify-center cursor-col-resize hover:bg-white/30 rounded-r -mr-1 text-[8px] font-mono text-sky-300 font-bold"
                      >
                        ▐
                      </div>
                    </div>
                  )}

                  {/* 2B. VISIBLE INTERACTIVE CLIP SPAN FOR TEXT OVERLAYS */}
                  {text && (
                    <div
                      style={{
                        left: `${((text.startFrame - 1) / totalFrames) * 100}%`,
                        width: `${Math.max(
                          2,
                          (text.durationFrames / totalFrames) * 100
                        )}%`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLayer(layer.id);
                        onSelectObject({ type: 'text', id: text.id });
                        if (
                          currentFrame < text.startFrame ||
                          currentFrame > text.startFrame + text.durationFrames
                        ) {
                          setCurrentFrame(text.startFrame);
                        }
                      }}
                      onMouseDown={(e) =>
                        startClipDrag(
                          e,
                          'text',
                          text.id,
                          'move',
                          text.startFrame,
                          text.durationFrames
                        )
                      }
                      title={`Texto: "${text.text}" | Início: Frame ${
                        text.startFrame
                      } | Fim: Frame ${
                        text.startFrame + text.durationFrames
                      } | Duração: ${text.durationFrames} frames (${(
                        text.durationFrames / fps
                      ).toFixed(1)}s)`}
                      className={`absolute top-1 bottom-1 rounded z-10 flex items-center justify-between px-1 select-none shadow-md border group cursor-grab active:cursor-grabbing transition-all ${
                        selectedObject?.type === 'text' &&
                        selectedObject.id === text.id
                          ? 'bg-gradient-to-r from-emerald-600/80 to-teal-600/80 border-emerald-300 text-white ring-1 ring-emerald-400'
                          : 'bg-gradient-to-r from-emerald-950/90 to-teal-950/90 border-emerald-500/60 text-emerald-200 hover:border-emerald-400'
                      }`}
                    >
                      {/* Left Trim Handle */}
                      <div
                        onMouseDown={(e) =>
                          startClipDrag(
                            e,
                            'text',
                            text.id,
                            'trim-start',
                            text.startFrame,
                            text.durationFrames
                          )
                        }
                        title="Arraste para alterar o Frame Inicial"
                        className="h-full w-2.5 flex items-center justify-center cursor-col-resize hover:bg-white/30 rounded-l -ml-1 text-[8px] font-mono text-emerald-300"
                      >
                        ▌
                      </div>

                      {/* Clip Label */}
                      <div className="flex items-center gap-1.5 overflow-hidden mx-1 pointer-events-none">
                        <Type size={11} className="shrink-0 text-emerald-300" />
                        <span className="text-[10px] font-bold truncate">
                          {text.text}
                        </span>

                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/50 text-emerald-200 shrink-0 border border-emerald-500/30">
                          F{text.startFrame} ➔ F{text.startFrame + text.durationFrames} (
                          {text.durationFrames}f)
                        </span>

                        {text.hasMotionTween && (
                          <span className="text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 flex items-center gap-0.5">
                            ◆ ➔ ◆ P1➔P2
                          </span>
                        )}
                      </div>

                      {/* Right Trim Handle */}
                      <div
                        onMouseDown={(e) =>
                          startClipDrag(
                            e,
                            'text',
                            text.id,
                            'trim-end',
                            text.startFrame,
                            text.durationFrames
                          )
                        }
                        title="Arraste para estender ou encurtar a duração"
                        className="h-full w-3 flex items-center justify-center cursor-col-resize hover:bg-white/30 rounded-r -mr-1 text-[8px] font-mono text-emerald-300 font-bold"
                      >
                        ▐
                      </div>
                    </div>
                  )}

                  {/* 2C'. ACTOR CLIP SPAN + KEYFRAME DIAMONDS */}
                  {actor && (
                    <>
                      <div
                        style={{
                          left: `${((actor.startFrame - 1) / totalFrames) * 100}%`,
                          width: `${Math.max(1, (actor.durationFrames / totalFrames) * 100)}%`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLayer(layer.id);
                          onSelectObject({ type: 'actor', id: actor.id });
                        }}
                        onMouseDown={(e) =>
                          startClipDrag(e, 'actor', actor.id, 'move', actor.startFrame, actor.durationFrames)
                        }
                        title={`${actor.name} | F${actor.startFrame} ➔ F${actor.startFrame + actor.durationFrames}\nArraste para mover (os keyframes vão junto); bordas ajustam a duração`}
                        className={`absolute top-1 bottom-1 rounded z-10 flex items-center justify-between select-none border cursor-grab active:cursor-grabbing ${
                          selectedObject?.type === 'actor' && selectedObject.id === actor.id
                            ? 'bg-orange-600/40 border-orange-300 ring-1 ring-orange-400'
                            : 'bg-orange-950/70 border-orange-500/50 hover:border-orange-400'
                        }`}
                      >
                        <div
                          onMouseDown={(e) =>
                            startClipDrag(e, 'actor', actor.id, 'trim-start', actor.startFrame, actor.durationFrames)
                          }
                          className="h-full w-2 cursor-col-resize hover:bg-white/30 rounded-l"
                        />
                        <span className="text-[10px] font-bold text-orange-200 truncate px-1 pointer-events-none">
                          {actor.name}
                        </span>
                        <div
                          onMouseDown={(e) =>
                            startClipDrag(e, 'actor', actor.id, 'trim-end', actor.startFrame, actor.durationFrames)
                          }
                          className="h-full w-2 cursor-col-resize hover:bg-white/30 rounded-r"
                        />
                      </div>
                      {actorKeyframes(actor).map((f) => (
                        <button
                          key={f}
                          style={{ left: `${((f - 1) / totalFrames) * 100}%` }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onSelectLayer(layer.id);
                            onSelectObject({ type: 'actor', id: actor.id });
                            setKeyDrag({
                              actor,
                              fromFrame: f,
                              toFrame: f,
                              startClientX: e.clientX,
                              trackWidth: tracksContainerRef.current?.getBoundingClientRect().width || 800,
                              baseSnapshot: getCurrentSnapshot?.(),
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title={`Keyframe no frame ${f} — arraste para mudar o tempo`}
                          className={`absolute z-20 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border border-neutral-950 ${
                            f === currentFrame ? 'bg-white' : 'bg-amber-400 hover:bg-amber-200'
                          }`}
                        />
                      ))}
                    </>
                  )}

                  {/* 2C. STICK FIGURE KEYFRAME DIAMONDS AND SPANS */}
                  {layer.type === 'group' && (
                    <div className="absolute inset-0 flex items-center pointer-events-none">
                      {Array.from({ length: totalFrames }).map((_, i) => {
                        const fNum = i + 1;
                        const frameData = frames[fNum];
                        const sticksHere = (frameData?.stickFigures ?? []).filter(
                          (s) => !layer.targetId || s.id === layer.targetId
                        );
                        if (sticksHere.length === 0) return null;
                        // In-betweens generated by a pose tween are dots; hand-made poses are diamonds
                        const onlyTweened = sticksHere.every((s) => s.tweened);

                        return (
                          <div
                            key={fNum}
                            style={{
                              left: `${((fNum - 1) / totalFrames) * 100}%`,
                              width: `${100 / totalFrames}%`,
                            }}
                            className="absolute flex items-center justify-center h-full"
                          >
                            {onlyTweened ? (
                              <div
                                title={`Pose interpolada no frame ${fNum}`}
                                className="w-1.5 h-1.5 rounded-full bg-amber-400/60 z-10"
                              />
                            ) : (
                              <div
                                title={`Pose-chave de Boneco Palito no Frame ${fNum}`}
                                className="w-3 h-3 rotate-45 bg-amber-400 border border-neutral-900 shadow-md shadow-amber-400/40 z-10"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 2D. DRAWING KEYFRAME DOTS */}
                  {layer.type === 'drawing' && (
                    <div className="absolute inset-0 flex items-center pointer-events-none">
                      {Array.from({ length: totalFrames }).map((_, i) => {
                        const fNum = i + 1;
                        const frameData = frames[fNum];
                        const hasDrawings =
                          frameData?.drawings && frameData.drawings.length > 0;

                        if (!hasDrawings) return null;

                        return (
                          <div
                            key={fNum}
                            style={{
                              left: `${((fNum - 1) / totalFrames) * 100}%`,
                              width: `${100 / totalFrames}%`,
                            }}
                            className="absolute flex items-center justify-center h-full"
                          >
                            <div
                              title={`Keyframe de Desenho no Frame ${fNum}`}
                              className="w-2.5 h-2.5 rounded-full bg-pink-400 border border-neutral-900 shadow-md z-10"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
