import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FrameData,
  ChartOverlay,
  TextOverlay,
  ImageOverlay,
  VideoBackground,
  StudioLayer,
  SelectedObjectRef,
  CanvasGroup,
  DrawingStroke,
  StickFigure,
  CanvasDimensions,
  HistorySnapshot,
} from './types';
import {
  createDefaultStickFigure,
  applyPoseToStickFigure,
} from './utils/stickFigurePresets';
import { exportVideoSequence, exportSnapshotPNG } from './utils/exportVideo';
import { useHistory } from './hooks/useHistory';
import { StudioHeader } from './components/StudioHeader';
import { FlashCanvas } from './components/FlashCanvas';
import { PropertiesInspector } from './components/PropertiesInspector';
import { Timeline } from './components/Timeline';
import { AiImageModal } from './components/AiImageModal';
import { GeminiChatbot } from './components/GeminiChatbot';

export default function App() {
  // Timeline playback state
  const [currentFrame, setCurrentFrame] = useState<number>(1);
  const [totalFrames, setTotalFrames] = useState<number>(60);
  const [fps, setFps] = useState<number>(24);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);

  // Canvas Dimensions (YouTube 1080p, 720p, Shorts, etc.)
  const [canvasDimensions, setCanvasDimensions] = useState<CanvasDimensions>({
    width: 1280,
    height: 720,
    preset: 'youtube-720p',
  });

  // Timeline panel height (resizable by user)
  const [timelineHeight, setTimelineHeight] = useState<number>(200);

  // Active Flash Canvas Tool
  const [activeTool, setActiveTool] = useState<
    'pointer' | 'transform' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'eraser'
  >('pointer');
  const [strokeColor, setStrokeColor] = useState<string>('#38bdf8');
  const [strokeThickness, setStrokeThickness] = useState<number>(4);
  // Default to FALSE to eliminate unwanted onion skin shadows when deleting objects!
  const [onionSkinEnabled, setOnionSkinEnabled] = useState<boolean>(false);

  // Selection state
  const [selectedObject, setSelectedObject] = useState<SelectedObjectRef | null>({
    type: 'stick',
    id: 'stick-presenter',
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>('layer-drawings');

  // Video backdrop
  const [videoBg, setVideoBg] = useState<VideoBackground>({
    type: 'color',
    url: '',
    color: '#0a0a0f',
    opacity: 1,
    playbackRate: 1,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Initial Layers
  const initialLayers: StudioLayer[] = [
    {
      id: 'layer-drawings',
      name: 'Camada de Desenhos / Palito',
      type: 'drawing',
      visible: true,
      locked: false,
      color: '#38bdf8',
    },
    {
      id: 'layer-charts',
      name: 'Gráficos Interativos',
      type: 'chart',
      visible: true,
      locked: false,
      color: '#0ea5e9',
      targetId: 'chart-initial-1',
    },
    {
      id: 'layer-texts',
      name: 'Títulos & Contadores',
      type: 'text',
      visible: true,
      locked: false,
      color: '#10b981',
      targetId: 'text-initial-1',
    },
    {
      id: 'layer-video',
      name: 'Fundo do Palco (Vídeo/Cor)',
      type: 'video',
      visible: true,
      locked: false,
      color: '#a855f7',
    },
  ];

  // Initial Frames with stick figure
  const initialFrames: Record<number, FrameData> = {};
  const presenterStick = createDefaultStickFigure(
    'stick-presenter',
    'Palito Educativo',
    240,
    430
  );
  presenterStick.scale = 1.25;

  for (let f = 1; f <= 60; f++) {
    let poseKey = 'stand';
    let xPos = 240;

    if (f <= 15) {
      poseKey = f % 6 < 3 ? 'walkA' : 'walkB';
      xPos = 140 + f * 7;
    } else if (f <= 45) {
      poseKey = 'pointingChart';
      xPos = 245;
    } else {
      poseKey = 'wave';
      xPos = 245;
    }

    initialFrames[f] = {
      frameNumber: f,
      stickFigures: [
        applyPoseToStickFigure({ ...presenterStick, x: xPos, y: 430 }, poseKey),
      ],
      drawings: [],
      groups: [],
    };
  }

  // Initial Overlays
  const initialCharts: ChartOverlay[] = [
    {
      id: 'chart-initial-1',
      title: 'Crescimento de Audiência',
      type: 'bar',
      x: 640,
      y: 110,
      width: 540,
      height: 330,
      startFrame: 1,
      durationFrames: 50,
      animationType: 'grow',
      data: [
        { label: 'Jan', value: 35, color: '#38bdf8' },
        { label: 'Fev', value: 68, color: '#0ea5e9' },
        { label: 'Mar', value: 110, color: '#6366f1' },
        { label: 'Abr', value: 185, color: '#a855f7' },
      ],
      visible: true,
    },
  ];

  const initialTexts: TextOverlay[] = [
    {
      id: 'text-initial-1',
      text: 'ANIMAÇÃO EXPLICATIVA',
      x: 640,
      y: 70,
      fontSize: 28,
      color: '#ffffff',
      startFrame: 1,
      durationFrames: 60,
      effect: 'fadeRise',
      visible: true,
      isNumberCounter: false,
    },
    {
      id: 'text-counter-1',
      text: 'Inscritos',
      x: 640,
      y: 480,
      fontSize: 24,
      color: '#38bdf8',
      startFrame: 5,
      durationFrames: 50,
      effect: 'numberRoll',
      visible: true,
      isNumberCounter: true,
      counterStart: 100,
      counterEnd: 15400,
      counterPrefix: '+',
      counterSuffix: ' devs',
    },
  ];

  // ================= UNDO / REDO HISTORY ENGINE =================
  const history = useHistory({
    description: 'Estado Inicial',
    frames: initialFrames,
    charts: initialCharts,
    texts: initialTexts,
    images: [],
    layers: initialLayers,
  });

  const { frames, charts, texts, images, layers } = history.present;

  // UI Modals & Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [aiModalOpen, setAiModalOpen] = useState<boolean>(false);
  const [chatbotOpen, setChatbotOpen] = useState<boolean>(false);
  const [canvasSnapshot, setCanvasSnapshot] = useState<string | null>(null);

  // Sync hidden video currentTime with timeline scrubber
  useEffect(() => {
    const v = videoRef.current;
    if (v && videoBg.type !== 'color' && v.duration) {
      const timeInSec = (currentFrame - 1) / fps;
      v.currentTime = timeInSec % v.duration;
    }
  }, [currentFrame, fps, videoBg.type]);

  // Frame update handler
  const handleUpdateFrameData = useCallback(
    (frameNum: number, data: FrameData) => {
      history.pushSnapshot('Modificar Palco', {
        ...history.present,
        frames: {
          ...history.present.frames,
          [frameNum]: data,
        },
      });
    },
    [history]
  );

  // Transient frame update (live dragging, zero history steps pushed)
  const handleTransientUpdateFrameData = useCallback(
    (frameNum: number, data: FrameData) => {
      history.updatePresent((prev) => ({
        ...prev,
        frames: {
          ...prev.frames,
          [frameNum]: data,
        },
      }));
    },
    [history]
  );

  // Committed frame update (on mouse up after drag, pushes exactly ONE history step from base snapshot)
  const handleCommitFrameData = useCallback(
    (frameNum: number, data: FrameData, description: string, baseSnapshot: HistorySnapshot) => {
      const finalSnapshot: HistorySnapshot = {
        ...history.presentRef.current,
        frames: {
          ...history.presentRef.current.frames,
          [frameNum]: data,
        },
      };
      history.commitAction(description, baseSnapshot, finalSnapshot);
    },
    [history]
  );

  // Transient chart update (live dragging, zero history steps pushed)
  const handleTransientUpdateChart = useCallback(
    (chart: ChartOverlay) => {
      history.updatePresent((prev) => ({
        ...prev,
        charts: prev.charts.map((c) => (c.id === chart.id ? chart : c)),
      }));
    },
    [history]
  );

  // Committed chart update (stores single step from drag start)
  const handleCommitChart = useCallback(
    (chart: ChartOverlay, description: string, baseSnapshot: HistorySnapshot) => {
      const finalSnapshot: HistorySnapshot = {
        ...history.presentRef.current,
        charts: history.presentRef.current.charts.map((c) => (c.id === chart.id ? chart : c)),
      };
      history.commitAction(description, baseSnapshot, finalSnapshot);
    },
    [history]
  );

  // Transient text update (live dragging, zero history steps pushed)
  const handleTransientUpdateText = useCallback(
    (text: TextOverlay) => {
      history.updatePresent((prev) => ({
        ...prev,
        texts: prev.texts.map((t) => (t.id === text.id ? text : t)),
      }));
    },
    [history]
  );

  // Committed text update (stores single step from drag start)
  const handleCommitText = useCallback(
    (text: TextOverlay, description: string, baseSnapshot: HistorySnapshot) => {
      const finalSnapshot: HistorySnapshot = {
        ...history.presentRef.current,
        texts: history.presentRef.current.texts.map((t) => (t.id === text.id ? text : t)),
      };
      history.commitAction(description, baseSnapshot, finalSnapshot);
    },
    [history]
  );

  // Delete Stick Figure handler (from current frame or all frames)
  const handleDeleteStickFigure = useCallback(
    (stickId: string, allFrames = false) => {
      if (allFrames) {
        const updatedFrames: Record<number, FrameData> = {};
        for (const [fNum, fData] of Object.entries(history.present.frames)) {
          updatedFrames[Number(fNum)] = {
            ...fData,
            stickFigures: fData.stickFigures.filter((s) => s.id !== stickId),
          };
        }
        history.pushSnapshot('Excluir Boneco de Todos os Quadros', {
          ...history.present,
          frames: updatedFrames,
        });
      } else {
        const currentData = history.present.frames[currentFrame] || {
          frameNumber: currentFrame,
          stickFigures: [],
          drawings: [],
          groups: [],
        };
        const updatedSticks = currentData.stickFigures.filter((s) => s.id !== stickId);
        history.pushSnapshot(`Excluir Boneco do Frame ${currentFrame}`, {
          ...history.present,
          frames: {
            ...history.present.frames,
            [currentFrame]: {
              ...currentData,
              stickFigures: updatedSticks,
            },
          },
        });
      }
      setSelectedObject(null);
    },
    [currentFrame, history]
  );

  // Timeline resize drag handler
  const startResizeTimeline = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = timelineHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newH = Math.max(110, Math.min(500, startH + deltaY));
      setTimelineHeight(newH);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Duplicate current frame to the next frame (Flash F6 Keyframe)
  const handleDuplicateCurrentFrame = () => {
    if (currentFrame >= totalFrames) return;
    const current = frames[currentFrame];
    if (!current) return;

    const nextFrameNum = currentFrame + 1;
    const duplicated: FrameData = JSON.parse(JSON.stringify(current));
    duplicated.frameNumber = nextFrameNum;

    history.pushSnapshot(`Duplicar Frame ${currentFrame} -> ${nextFrameNum}`, {
      ...history.present,
      frames: {
        ...history.present.frames,
        [nextFrameNum]: duplicated,
      },
    });
    setCurrentFrame(nextFrameNum);
  };

  // Clear current frame
  const handleClearCurrentFrame = () => {
    history.pushSnapshot(`Limpar Frame ${currentFrame}`, {
      ...history.present,
      frames: {
        ...history.present.frames,
        [currentFrame]: {
          frameNumber: currentFrame,
          stickFigures: [],
          drawings: [],
          groups: [],
        },
      },
    });
    setSelectedObject(null);
  };

  // ================= GROUP / UNGROUP OBJECTS =================
  // Flash-inspired: "um boneco palito é resultado de um grupo de objetos -> varios palitos e um circulo"
  const handleUngroupSelected = () => {
    const currentFrameData = frames[currentFrame];
    if (!currentFrameData) return;

    // 1. If a Stick Figure is selected, break it apart into individual drawings (head circle + bone line strokes)
    if (selectedObject?.type === 'stick') {
      const stick = currentFrameData.stickFigures.find((s) => s.id === selectedObject.id);
      if (!stick) return;

      const newStrokes: DrawingStroke[] = [];

      // Head circle stroke
      const head = stick.joints['head'];
      if (head) {
        const hx = stick.x + head.x * stick.scale;
        const hy = stick.y + head.y * stick.scale;
        const hr = (head.radius || 20) * stick.scale;

        // Generate circle points
        const circlePoints = [];
        for (let i = 0; i <= 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          circlePoints.push({
            x: Math.round(hx + Math.cos(angle) * hr),
            y: Math.round(hy + Math.sin(angle) * hr),
          });
        }

        newStrokes.push({
          id: `stroke-head-${Date.now()}`,
          tool: 'circle',
          points: circlePoints,
          color: stick.color,
          thickness: Math.round(stick.thickness * stick.scale),
        });
      }

      // Bone line strokes
      stick.bones.forEach((bone, idx) => {
        const jFrom = stick.joints[bone.from];
        const jTo = stick.joints[bone.to];
        if (jFrom && jTo) {
          const x1 = Math.round(stick.x + jFrom.x * stick.scale);
          const y1 = Math.round(stick.y + jFrom.y * stick.scale);
          const x2 = Math.round(stick.x + jTo.x * stick.scale);
          const y2 = Math.round(stick.y + jTo.y * stick.scale);

          newStrokes.push({
            id: `stroke-bone-${idx}-${Date.now()}`,
            tool: 'line',
            points: [
              { x: x1, y: y1 },
              { x: x2, y: y2 },
            ],
            color: stick.color,
            thickness: Math.round(stick.thickness * stick.scale),
          });
        }
      });

      // Remove stick figure and add strokes
      const updatedSticks = currentFrameData.stickFigures.filter(
        (s) => s.id !== selectedObject.id
      );

      history.pushSnapshot('Desagrupar Boneco Palito em Traços Individuais', {
        ...history.present,
        frames: {
          ...history.present.frames,
          [currentFrame]: {
            ...currentFrameData,
            stickFigures: updatedSticks,
            drawings: [...currentFrameData.drawings, ...newStrokes],
          },
        },
      });

      setSelectedObject(null);
      return;
    }

    // 2. If a Canvas Group is selected, dissolve it into its member items
    if (selectedObject?.type === 'group') {
      const updatedGroups = (currentFrameData.groups || []).filter(
        (g) => g.id !== selectedObject.id
      );

      history.pushSnapshot('Desagrupar Grupo', {
        ...history.present,
        frames: {
          ...history.present.frames,
          [currentFrame]: {
            ...currentFrameData,
            groups: updatedGroups,
          },
        },
      });

      setSelectedObject(null);
    }
  };

  const handleGroupSelected = () => {
    const currentFrameData = frames[currentFrame];
    if (!currentFrameData) return;

    // Group all current drawing strokes into a single grouped symbol
    if (currentFrameData.drawings.length > 0) {
      const newGroup: CanvasGroup = {
        id: `group-${Date.now()}`,
        name: `Grupo ${Date.now().toString().slice(-4)}`,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        strokeIds: currentFrameData.drawings.map((d) => d.id),
      };

      history.pushSnapshot('Agrupar Traços do Canvas (Ctrl+G)', {
        ...history.present,
        frames: {
          ...history.present.frames,
          [currentFrame]: {
            ...currentFrameData,
            groups: [...(currentFrameData.groups || []), newGroup],
          },
        },
      });

      setSelectedObject({ type: 'group', id: newGroup.id });
    }
  };

  // ================= LAYER MANAGEMENT =================
  const handleAddLayer = (type: 'drawing' | 'chart' | 'text' | 'video' | 'group') => {
    const layerId = `layer-${type}-${Date.now()}`;
    let newName = 'Nova Camada';
    let newColor = '#38bdf8';
    let targetId: string | undefined = undefined;

    let updatedCharts = [...charts];
    let updatedTexts = [...texts];
    let updatedFrames = { ...history.present.frames };

    if (type === 'chart') {
      newName = 'Camada de Gráfico';
      newColor = '#0ea5e9';
      targetId = `chart-${Date.now()}`;
      const newChart: ChartOverlay = {
        id: targetId,
        title: 'Gráfico de Vendas',
        type: 'bar',
        x: Math.round(canvasDimensions.width * 0.42),
        y: Math.round(canvasDimensions.height * 0.22),
        width: 480,
        height: 280,
        startFrame: currentFrame,
        durationFrames: 60, // 60 frames = 2.5s @ 24fps
        animationType: 'grow',
        data: [
          { label: 'Jan', value: 45, color: '#38bdf8' },
          { label: 'Fev', value: 90, color: '#0ea5e9' },
          { label: 'Mar', value: 65, color: '#6366f1' },
          { label: 'Abr', value: 110, color: '#10b981' },
        ],
        visible: true,
        hasMotionTween: false,
        endX: Math.round(canvasDimensions.width * 0.42),
        endY: Math.round(canvasDimensions.height * 0.22),
        easing: 'easeOut',
      };
      updatedCharts.push(newChart);
      setSelectedObject({ type: 'chart', id: targetId });
    } else if (type === 'text') {
      newName = 'Camada de Texto / Contador';
      newColor = '#10b981';
      targetId = `text-${Date.now()}`;
      const newText: TextOverlay = {
        id: targetId,
        text: 'Novo Texto Animado',
        x: Math.round(canvasDimensions.width * 0.38),
        y: Math.round(canvasDimensions.height * 0.28),
        fontSize: 32,
        color: '#ffffff',
        startFrame: currentFrame,
        durationFrames: 60,
        effect: 'fadeRise',
        visible: true,
        hasMotionTween: false,
        endX: Math.round(canvasDimensions.width * 0.38),
        endY: Math.round(canvasDimensions.height * 0.28),
        easing: 'easeOut',
      };
      updatedTexts.push(newText);
      setSelectedObject({ type: 'text', id: targetId });
    } else if (type === 'video') {
      newName = 'Camada de Fundo de Vídeo';
      newColor = '#a855f7';
    } else if (type === 'group') {
      newName = 'Camada de Boneco Palito';
      newColor = '#f59e0b';
      targetId = `stick-${Date.now()}`;
      const newStick = createDefaultStickFigure(
        targetId,
        `Boneco Palito ${Date.now() % 1000}`,
        Math.round(canvasDimensions.width / 2),
        Math.round(canvasDimensions.height / 2)
      );
      const curData = updatedFrames[currentFrame] || {
        frameNumber: currentFrame,
        stickFigures: [],
        drawings: [],
        groups: [],
      };
      updatedFrames[currentFrame] = {
        ...curData,
        stickFigures: [...curData.stickFigures, newStick],
      };
      setSelectedObject({ type: 'stick', id: targetId });
    } else if (type === 'drawing') {
      newName = 'Camada de Desenho';
      newColor = '#ec4899';
      setActiveTool('pen');
    }

    const newLayer: StudioLayer = {
      id: layerId,
      name: newName,
      type,
      visible: true,
      locked: false,
      color: newColor,
      targetId,
    };

    history.pushSnapshot(`Adicionar ${newName}`, {
      ...history.present,
      layers: [newLayer, ...layers],
      charts: updatedCharts,
      texts: updatedTexts,
      frames: updatedFrames,
    });

    setSelectedLayerId(layerId);
  };

  const handleDeleteLayer = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;

    let updatedCharts = charts;
    let updatedTexts = texts;

    if (layer.targetId) {
      if (layer.type === 'chart') {
        updatedCharts = charts.filter((c) => c.id !== layer.targetId);
      } else if (layer.type === 'text') {
        updatedTexts = texts.filter((t) => t.id !== layer.targetId);
      }
    }

    history.pushSnapshot(`Excluir Camada ${layer.name}`, {
      ...history.present,
      layers: layers.filter((l) => l.id !== layerId),
      charts: updatedCharts,
      texts: updatedTexts,
    });

    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
      setSelectedObject(null);
    }
  };

  const handleToggleLayerVisible = (layerId: string) => {
    const updated = layers.map((l) =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    );
    history.pushSnapshot('Alternar Visibilidade da Camada', {
      ...history.present,
      layers: updated,
    });
  };

  const handleToggleLayerLock = (layerId: string) => {
    const updated = layers.map((l) =>
      l.id === layerId ? { ...l, locked: !l.locked } : l
    );
    history.pushSnapshot('Alternar Bloqueio da Camada', {
      ...history.present,
      layers: updated,
    });
  };

  const handleMoveLayer = (layerId: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === layers.length - 1) return;

    const newLayers = [...layers];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = newLayers[idx];
    newLayers[idx] = newLayers[targetIdx];
    newLayers[targetIdx] = temp;

    history.pushSnapshot('Reordenar Camadas', {
      ...history.present,
      layers: newLayers,
    });
  };

  const handleRenameLayer = (layerId: string, newName: string) => {
    const updated = layers.map((l) =>
      l.id === layerId ? { ...l, name: newName } : l
    );
    history.pushSnapshot(`Renomear Camada p/ "${newName}"`, {
      ...history.present,
      layers: updated,
    });
  };

  // ================= CHARTS & TEXTS HANDLERS =================
  const handleUpdateChart = (updatedChart: ChartOverlay) => {
    history.pushSnapshot(`Atualizar Gráfico "${updatedChart.title}"`, {
      ...history.present,
      charts: charts.map((c) => (c.id === updatedChart.id ? updatedChart : c)),
    });
  };

  const handleDeleteChart = (chartId: string) => {
    history.pushSnapshot('Excluir Gráfico', {
      ...history.present,
      charts: charts.filter((c) => c.id !== chartId),
    });
    if (selectedObject?.id === chartId) setSelectedObject(null);
  };

  const handleUpdateText = (updatedText: TextOverlay) => {
    history.pushSnapshot(`Atualizar Texto "${updatedText.text.slice(0, 15)}"`, {
      ...history.present,
      texts: texts.map((t) => (t.id === updatedText.id ? updatedText : t)),
    });
  };

  const handleDeleteText = (textId: string) => {
    history.pushSnapshot('Excluir Texto', {
      ...history.present,
      texts: texts.filter((t) => t.id !== textId),
    });
    if (selectedObject?.id === textId) setSelectedObject(null);
  };

  // ================= KEYBOARD SHORTCUTS =================
  // Flash-standard Ctrl+Z, Ctrl+Y, Ctrl+G, Ctrl+B, Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ctrl+Z / Cmd+Z -> Undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          history.redo();
        } else {
          history.undo();
        }
      }
      // Ctrl+Y -> Redo
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      }
      // Ctrl+G -> Group
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        handleGroupSelected();
      }
      // Ctrl+B -> Break apart / Ungroup (Classic Macromedia Flash shortcut)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleUngroupSelected();
      }
      // F6 -> Duplicate Keyframe
      else if (e.key === 'F6') {
        e.preventDefault();
        handleDuplicateCurrentFrame();
      }
      // Delete or Backspace -> Delete selected item
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObject) {
          e.preventDefault();
          if (selectedObject.type === 'chart') handleDeleteChart(selectedObject.id);
          else if (selectedObject.type === 'text') handleDeleteText(selectedObject.id);
          else if (selectedObject.type === 'stick') {
            handleDeleteStickFigure(selectedObject.id, false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    history,
    selectedObject,
    currentFrame,
    frames,
    handleUpdateFrameData,
    handleDeleteStickFigure,
    handleDeleteChart,
    handleDeleteText,
    handleGroupSelected,
    handleUngroupSelected,
    handleDuplicateCurrentFrame,
  ]);

  // ================= SCENE PRESETS =================
  const handleLoadPreset = (presetName: string) => {
    if (presetName === 'presenter') {
      const newFrames: Record<number, FrameData> = {};
      const baseStick = createDefaultStickFigure('stick-presenter', 'Palito Professor', 240, 430);
      baseStick.scale = 1.25;

      for (let f = 1; f <= 60; f++) {
        let poseKey = 'stand';
        let xPos = 240;

        if (f <= 15) {
          poseKey = f % 6 < 3 ? 'walkA' : 'walkB';
          xPos = 140 + f * 7;
        } else if (f <= 45) {
          poseKey = 'pointingChart';
          xPos = 245;
        } else {
          poseKey = 'wave';
          xPos = 245;
        }

        newFrames[f] = {
          frameNumber: f,
          stickFigures: [
            applyPoseToStickFigure({ ...baseStick, x: xPos, y: 430 }, poseKey),
          ],
          drawings: [],
          groups: [],
        };
      }

      history.pushSnapshot('Carregar Cena: Apresentador Educativo', {
        ...history.present,
        frames: newFrames,
        charts: initialCharts,
        texts: initialTexts,
      });

      setCurrentFrame(1);
      setSelectedObject({ type: 'stick', id: 'stick-presenter' });
    } else if (presetName === 'walkcycle') {
      const newFrames: Record<number, FrameData> = {};
      const baseStick = createDefaultStickFigure('stick-walker', 'Caminhante', 150, 420);

      for (let f = 1; f <= 48; f++) {
        const xPos = 120 + f * 16;
        const isA = Math.floor(f / 6) % 2 === 0;
        const poseKey = isA ? 'walkA' : 'walkB';

        newFrames[f] = {
          frameNumber: f,
          stickFigures: [
            applyPoseToStickFigure(
              { ...baseStick, id: 'stick-walker', x: xPos, y: 420 + (f % 6 === 0 ? -6 : 0) },
              poseKey
            ),
          ],
          drawings: [],
          groups: [],
        };
      }

      history.pushSnapshot('Carregar Cena: Caminhada Stick Figure', {
        ...history.present,
        frames: newFrames,
      });

      setCurrentFrame(1);
      setSelectedObject({ type: 'stick', id: 'stick-walker' });
    } else if (presetName === 'action') {
      const newFrames: Record<number, FrameData> = {};
      const fighter = createDefaultStickFigure('stick-action', 'Acrobata Flash', 280, 420);
      fighter.color = '#ef4444';

      for (let f = 1; f <= 48; f++) {
        let pose = 'stand';
        let yPos = 420;
        let xPos = 280;

        if (f < 12) {
          pose = 'run';
          xPos = 180 + f * 10;
        } else if (f < 24) {
          pose = 'jump';
          yPos = 310 - Math.sin(((f - 12) / 12) * Math.PI) * 90;
          xPos = 300 + (f - 12) * 12;
        } else if (f < 36) {
          pose = 'kick';
          xPos = 450;
        } else {
          pose = 'wave';
          xPos = 450;
        }

        newFrames[f] = {
          frameNumber: f,
          stickFigures: [
            applyPoseToStickFigure({ ...fighter, x: xPos, y: yPos }, pose),
          ],
          drawings: [],
          groups: [],
        };
      }

      history.pushSnapshot('Carregar Cena: Ação Flash', {
        ...history.present,
        frames: newFrames,
      });

      setCurrentFrame(1);
      setSelectedObject({ type: 'stick', id: 'stick-action' });
    }
  };

  const handleResetProject = () => {
    const emptyFrames: Record<number, FrameData> = {};
    for (let f = 1; f <= totalFrames; f++) {
      emptyFrames[f] = {
        frameNumber: f,
        stickFigures: [],
        drawings: [],
        groups: [],
      };
    }
    history.pushSnapshot('Reiniciar Projeto', {
      ...history.present,
      frames: emptyFrames,
      charts: [],
      texts: [],
      images: [],
    });
    setCurrentFrame(1);
  };

  // Video Upload
  const handleUploadVideo = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setVideoBg({
      type: 'upload',
      url: objectUrl,
      opacity: 0.85,
      playbackRate: 1,
    });
  };

  // Export Video
  const handleExportVideo = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setIsPlaying(false);

    try {
      const blob = await exportVideoSequence(
        frames,
        totalFrames,
        fps,
        charts,
        texts,
        images,
        videoBg,
        videoRef.current,
        (progress) => setExportProgress(progress),
        layers,
        canvasDimensions.width,
        canvasDimensions.height
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `animacao-flashmotion-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Snapshot PNG
  const handleSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      exportSnapshotPNG(canvas, `frame-${currentFrame}-snapshot.png`);
    }
  };

  // Open AI Image Modal
  const handleOpenAiImage = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      setCanvasSnapshot(canvas.toDataURL('image/png'));
    }
    setAiModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans">
      {/* Hidden Video element for background video frame grabbing */}
      {videoBg.url && (
        <video
          ref={videoRef}
          src={videoBg.url}
          crossOrigin="anonymous"
          muted
          playsInline
          className="hidden"
        />
      )}

      {/* Top Flash Studio Header with History & Grouping controls */}
      <StudioHeader
        onExportVideo={handleExportVideo}
        isExporting={isExporting}
        exportProgress={exportProgress}
        onSnapshot={handleSnapshot}
        onOpenAiImage={handleOpenAiImage}
        onToggleChatbot={() => setChatbotOpen((prev) => !prev)}
        chatbotOpen={chatbotOpen}
        onLoadPreset={handleLoadPreset}
        onResetProject={handleResetProject}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        hasSelection={selectedObject !== null}
        canvasDimensions={canvasDimensions}
        onUpdateCanvasDimensions={setCanvasDimensions}
      />

      {/* Middle Stage & Inspector Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Center: Flash Stage with Classic Left Toolbar and Direct Dragging */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
          <FlashCanvas
            currentFrame={currentFrame}
            totalFrames={totalFrames}
            fps={fps}
            frames={frames}
            onUpdateFrameData={handleUpdateFrameData}
            onTransientUpdateFrameData={handleTransientUpdateFrameData}
            onCommitFrameData={handleCommitFrameData}
            selectedObject={selectedObject}
            onSelectObject={setSelectedObject}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            strokeColor={strokeColor}
            setStrokeColor={setStrokeColor}
            strokeThickness={strokeThickness}
            setStrokeThickness={setStrokeThickness}
            onionSkinEnabled={onionSkinEnabled}
            setOnionSkinEnabled={setOnionSkinEnabled}
            onionSkinFrames={1}
            charts={charts}
            onUpdateChart={handleUpdateChart}
            onTransientUpdateChart={handleTransientUpdateChart}
            onCommitChart={handleCommitChart}
            onDeleteChart={handleDeleteChart}
            texts={texts}
            onUpdateText={handleUpdateText}
            onTransientUpdateText={handleTransientUpdateText}
            onCommitText={handleCommitText}
            onDeleteText={handleDeleteText}
            images={images}
            videoBg={videoBg}
            videoElement={videoRef.current}
            isPlaying={isPlaying}
            layers={layers}
            onGroupSelected={handleGroupSelected}
            onUngroupSelected={handleUngroupSelected}
            onDeleteStickFigure={handleDeleteStickFigure}
            canvasWidth={canvasDimensions.width}
            canvasHeight={canvasDimensions.height}
            getCurrentSnapshot={() => history.presentRef.current}
          />
        </div>

        {/* Right Panel: Flash Properties Inspector (Contextual, Symbol Library & History Stack) */}
        <PropertiesInspector
          selectedObject={selectedObject}
          onSelectObject={setSelectedObject}
          charts={charts}
          onUpdateChart={handleUpdateChart}
          onDeleteChart={handleDeleteChart}
          onAddChart={(chartType) => {
            const newChart: ChartOverlay = {
              id: `chart-${Date.now()}`,
              title: 'Novo Gráfico Animado',
              type: chartType || 'bar',
              x: 640,
              y: 160,
              width: 480,
              height: 280,
              startFrame: currentFrame,
              durationFrames: 30,
              animationType: 'grow',
              data: [
                { label: 'A', value: 40, color: '#38bdf8' },
                { label: 'B', value: 85, color: '#0ea5e9' },
                { label: 'C', value: 60, color: '#6366f1' },
              ],
              visible: true,
            };
            history.pushSnapshot(`Adicionar Gráfico "${newChart.title}"`, {
              ...history.present,
              charts: [...charts, newChart],
            });
            setSelectedObject({ type: 'chart', id: newChart.id });
          }}
          texts={texts}
          onUpdateText={handleUpdateText}
          onDeleteText={handleDeleteText}
          onAddText={(isNumber) => {
            const newText: TextOverlay = {
              id: `text-${Date.now()}`,
              text: isNumber ? 'Contador' : 'Novo Texto Animado',
              x: 640,
              y: 220,
              fontSize: 28,
              color: '#ffffff',
              startFrame: currentFrame,
              durationFrames: 30,
              effect: isNumber ? 'numberRoll' : 'fadeRise',
              visible: true,
              isNumberCounter: !!isNumber,
              counterStart: 0,
              counterEnd: 1000,
              counterPrefix: '',
              counterSuffix: '',
            };
            history.pushSnapshot(`Adicionar ${isNumber ? 'Contador' : 'Texto'}`, {
              ...history.present,
              texts: [...texts, newText],
            });
            setSelectedObject({ type: 'text', id: newText.id });
          }}
          currentFrame={currentFrame}
          currentFrameData={
            frames[currentFrame] || {
              frameNumber: currentFrame,
              stickFigures: [],
              drawings: [],
              groups: [],
            }
          }
          onUpdateFrameData={handleUpdateFrameData}
          onGroupSelected={handleGroupSelected}
          onUngroupSelected={handleUngroupSelected}
          onAddStickFigure={() => {
            const currentF = frames[currentFrame] || {
              frameNumber: currentFrame,
              stickFigures: [],
              drawings: [],
              groups: [],
            };
            const newId = `stick-${Date.now()}`;
            const newStick = createDefaultStickFigure(
              newId,
              'Novo Boneco Palito',
              350,
              420
            );
            handleUpdateFrameData(currentFrame, {
              ...currentF,
              stickFigures: [...currentF.stickFigures, newStick],
            });
            setSelectedObject({ type: 'stick', id: newId });
          }}
          fps={fps}
          setFps={setFps}
          totalFrames={totalFrames}
          setTotalFrames={setTotalFrames}
          videoBg={videoBg}
          setVideoBg={setVideoBg}
          pastSteps={history.past}
          futureSteps={history.future}
          onJumpToHistory={history.jumpToSnapshot}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
          canvasDimensions={canvasDimensions}
          onUpdateCanvasDimensions={setCanvasDimensions}
          timelineHeight={timelineHeight}
          setTimelineHeight={setTimelineHeight}
          onDeleteStickFigure={handleDeleteStickFigure}
          onJumpToFrame={setCurrentFrame}
        />
      </div>

      {/* Draggable Divider to Expand/Shrink Timeline & Stage */}
      <div
        onMouseDown={startResizeTimeline}
        className="h-2 w-full bg-neutral-900 hover:bg-sky-500/30 cursor-row-resize flex items-center justify-center transition select-none group border-t border-neutral-800 shrink-0"
        title="Arraste para redimensionar o espaço da linha do tempo"
      >
        <div className="w-16 h-1 rounded-full bg-neutral-700 group-hover:bg-sky-400 transition" />
      </div>

      {/* Bottom Area: Flash-style Timeline with Layers Panel, Visibility, Lock & Ruler */}
      <div className="shrink-0 overflow-hidden flex flex-col" style={{ height: timelineHeight }}>
        <Timeline
          currentFrame={currentFrame}
          setCurrentFrame={setCurrentFrame}
          totalFrames={totalFrames}
          setTotalFrames={setTotalFrames}
          fps={fps}
          setFps={setFps}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          isLooping={isLooping}
          setIsLooping={setIsLooping}
          frames={frames}
          onDuplicateCurrentFrame={handleDuplicateCurrentFrame}
          onClearCurrentFrame={handleClearCurrentFrame}
          layers={layers}
          onAddLayer={handleAddLayer}
          onDeleteLayer={handleDeleteLayer}
          onToggleLayerVisible={handleToggleLayerVisible}
          onToggleLayerLock={handleToggleLayerLock}
          onMoveLayer={handleMoveLayer}
          onRenameLayer={handleRenameLayer}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
          charts={charts}
          texts={texts}
          images={images}
          selectedObject={selectedObject}
          onSelectObject={setSelectedObject}
          onUpdateChart={handleTransientUpdateChart}
          onUpdateText={handleTransientUpdateText}
          onCommitChart={handleCommitChart}
          onCommitText={handleCommitText}
          getCurrentSnapshot={history.getCurrentSnapshot}
          onJumpToFrame={setCurrentFrame}
        />
      </div>

      {/* AI Image Generation & Editing Modal */}
      <AiImageModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        canvasSnapshot={canvasSnapshot}
        onAddImageOverlay={(img) => {
          history.pushSnapshot('Adicionar Imagem IA', {
            ...history.present,
            images: [...images, img],
          });
        }}
        onSetAsBackground={(url) => {
          setVideoBg({
            type: 'preset',
            url,
            opacity: 1,
            playbackRate: 1,
          });
        }}
      />

      {/* Floating / Docked Gemini Animation Chatbot */}
      <GeminiChatbot
        isOpen={chatbotOpen}
        onToggle={() => setChatbotOpen(false)}
      />
    </div>
  );
}
