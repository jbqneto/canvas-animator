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
  ActorOverlay,
  MotionPath,
  StageTool,
  AudioClip,
} from './types';
import { createActor } from './engine/actor';
import { tweenStickFrames } from './engine/stickRig';
import type { EasingName } from './engine/keyframes';
import { isTypingTarget } from './utils/keyboard';
import { LOCALES, shortMonth, translate, useI18n } from './i18n';
import { parseProject, ProjectFileError, projectNameFromFile, serializeProject } from './project/projectFile';
import { openProjectFile, ProjectFileHandle, saveProjectFile } from './project/fileAccess';
import { AutosaveEntry, clearAutosave, readAutosave, writeAutosave } from './project/autosave';
import { loadImageFileAsActorSource } from './utils/importImage';
import {
  createDefaultStickFigure,
  applyPoseToStickFigure,
} from './utils/stickFigurePresets';
import {
  exportVideoSequence,
  exportFramePNG,
  renderFrameToDataURL,
  videoTimeForFrame,
} from './utils/exportVideo';
import { useHistory } from './hooks/useHistory';
import { StudioHeader } from './components/StudioHeader';
import { FlashCanvas } from './components/FlashCanvas';
import { PropertiesInspector } from './components/PropertiesInspector';
import { Timeline } from './components/Timeline';
import { AiImageModal } from './components/AiImageModal';
import { GeminiChatbot } from './components/GeminiChatbot';
import { ExportDialog, ExportRequest } from './components/ExportDialog';
import { PwaStatus } from './components/PwaStatus';
import { RouteDialog, RouteRequest } from './components/RouteDialog';
import { buildRouteTemplate, buildStopLabels } from './map/routeTemplate';
import { buildFollowProgress, samplePath } from './engine/path';
import { PLANE_ICON_ASPECT, PLANE_ICON_SRC } from './map/planeIcon';
import { framesToFitAudio, frameTime } from './engine/audio';
import { loadAudioFile, mixdown, playClips, prepareClips, resumeAudio, scrubClips } from './audio/audioRuntime';

const EMPTY_AUDIO: AudioClip[] = [];

export default function App() {
  const { t, locale } = useI18n();
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
  const [activeTool, setActiveTool] = useState<StageTool>('pointer');
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
  // Kept in state (not only a ref) so children re-render once the <video> element mounts
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // Set when a new video is uploaded: the timeline is resized to its length once metadata loads
  const fitTimelineToVideoRef = useRef(false);

  // Initial Layers
  const initialLayers: StudioLayer[] = [
    {
      id: 'layer-drawings',
      name: t('app.layer.drawings'),
      type: 'drawing',
      visible: true,
      locked: false,
      color: '#38bdf8',
    },
    {
      id: 'layer-charts',
      name: t('app.layer.charts'),
      type: 'chart',
      visible: true,
      locked: false,
      color: '#0ea5e9',
      targetId: 'chart-initial-1',
    },
    {
      id: 'layer-texts',
      name: t('app.layer.texts'),
      type: 'text',
      visible: true,
      locked: false,
      color: '#10b981',
      targetId: 'text-initial-1',
    },
    {
      id: 'layer-video',
      name: t('app.layer.background'),
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
    t('app.demo.stickName'),
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
      title: t('app.demo.chartTitle'),
      type: 'bar',
      x: 640,
      y: 110,
      width: 540,
      height: 330,
      startFrame: 1,
      durationFrames: 50,
      animationType: 'grow',
      data: [
        { label: shortMonth(0), value: 35, color: '#38bdf8' },
        { label: shortMonth(1), value: 68, color: '#0ea5e9' },
        { label: shortMonth(2), value: 110, color: '#6366f1' },
        { label: shortMonth(3), value: 185, color: '#a855f7' },
      ],
      visible: true,
    },
  ];

  const initialTexts: TextOverlay[] = [
    {
      id: 'text-initial-1',
      text: t('app.demo.headline'),
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
      text: t('app.demo.counterLabel'),
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
    description: t('history.initial'),
    frames: initialFrames,
    charts: initialCharts,
    texts: initialTexts,
    images: [],
    actors: [],
    paths: [],
    layers: initialLayers,
  });

  const { frames, charts, texts, images, actors, paths, layers } = history.present;
  const audio = history.present.audio ?? EMPTY_AUDIO;

  // UI Modals & Export state
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [aiModalOpen, setAiModalOpen] = useState<boolean>(false);
  const [chatbotOpen, setChatbotOpen] = useState<boolean>(false);
  const [canvasSnapshot, setCanvasSnapshot] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState<boolean>(false);

  // ================= PROJECT FILE (save / open / autosave) =================
  const [projectName, setProjectName] = useState(() => t('project.untitled'));
  const [videoFileName, setVideoFileName] = useState<string | undefined>();
  const [pendingRestore, setPendingRestore] = useState<AutosaveEntry | null>(null);
  const fileHandleRef = useRef<ProjectFileHandle | undefined>(undefined);
  const autosaveReadyRef = useRef(false);

  // Unsaved-changes tracking: state is immutable, so comparing references with the values at the
  // last save/open is exact (and immune to effects running twice in StrictMode).
  const currentMarker = { present: history.present, fps, totalFrames, canvasDimensions, videoBg, projectName };
  const [savedMarker, setSavedMarker] = useState(currentMarker);
  // When set, the state rendered next becomes the "saved" reference (after open/restore)
  const markSavedOnRenderRef = useRef(false);
  useEffect(() => {
    if (!markSavedOnRenderRef.current) return;
    markSavedOnRenderRef.current = false;
    setSavedMarker(currentMarker);
  });
  const isDirty = (Object.keys(currentMarker) as (keyof typeof currentMarker)[]).some(
    (k) => currentMarker[k] !== savedMarker[k]
  );

  // A never-named project follows the interface language ("Projeto sem título" ↔ "Untitled project")
  useEffect(() => {
    const isUntitled = (name: string) => LOCALES.some((l) => translate(l, 'project.untitled') === name);
    const untitled = translate(locale, 'project.untitled');
    setProjectName((name) => (isUntitled(name) ? untitled : name));
    // Renaming the default name is not an edit: keep the "saved" reference in sync
    setSavedMarker((m) => (isUntitled(m.projectName) ? { ...m, projectName: untitled } : m));
  }, [locale]);

  const serializeCurrent = () => {
    const { description: _d, ...content } = history.presentRef.current;
    return serializeProject(
      { name: projectName, fps, totalFrames, canvas: canvasDimensions, videoBg, content },
      videoFileName
    );
  };

  // Any content/settings change schedules an autosave
  useEffect(() => {
    if (!autosaveReadyRef.current) return;
    const timer = setTimeout(() => {
      writeAutosave({ text: serializeCurrent(), savedAt: Date.now(), name: projectName });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.present, fps, totalFrames, canvasDimensions, videoBg, projectName]);

  // On startup, offer to restore work that was never saved to a file
  useEffect(() => {
    readAutosave().then((entry) => {
      if (entry) setPendingRestore(entry);
      else autosaveReadyRef.current = true;
    });
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const applyProjectText = (text: string, name?: string) => {
    const project = parseProject(text);
    markSavedOnRenderRef.current = true;
    setFps(project.fps);
    setTotalFrames(project.totalFrames);
    setCanvasDimensions(project.canvas);
    setVideoBg(project.videoBg);
    setVideoFileName(undefined);
    setProjectName(name ?? project.name);
    history.reset({ description: t('history.projectOpened'), ...project.content });
    setCurrentFrame(1);
    setSelectedObject(null);
    setIsPlaying(false);
    return project;
  };

  const handleSaveProject = async (saveAs = false) => {
    try {
      const result = await saveProjectFile(serializeCurrent(), projectName, fileHandleRef.current, saveAs);
      if (result === null) return; // cancelled
      if (result) {
        fileHandleRef.current = result;
        setProjectName(projectNameFromFile(result.name));
        markSavedOnRenderRef.current = true; // the name change is part of the save
      }
      setSavedMarker(currentMarker);
    } catch (err) {
      alert(t('app.error.save', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  const handleOpenProject = async () => {
    if (isDirty && !confirm(t('app.confirm.openWithUnsaved'))) return;
    try {
      const opened = await openProjectFile();
      if (!opened) return;
      const project = applyProjectText(opened.text, projectNameFromFile(opened.fileName));
      fileHandleRef.current = opened.handle;
      if (project.missingVideo) {
        alert(t('app.missingVideo', { name: project.missingVideo }));
      }
    } catch (err) {
      alert(err instanceof ProjectFileError ? err.message : t('app.error.open', { error: String(err) }));
    }
  };

  // Installed app: files opened from the OS (double-click on .fmproj) arrive through the launch queue
  const openLaunchedFileRef = useRef<(handle: ProjectFileHandle) => void>(() => undefined);
  openLaunchedFileRef.current = async (handle) => {
    if (isDirty && !confirm(t('app.confirm.openFileWithUnsaved'))) return;
    try {
      const file = await handle.getFile();
      applyProjectText(await file.text(), projectNameFromFile(file.name));
      fileHandleRef.current = handle;
      setPendingRestore(null);
      autosaveReadyRef.current = true;
    } catch (err) {
      alert(err instanceof ProjectFileError ? err.message : t('app.error.open', { error: String(err) }));
    }
  };
  useEffect(() => {
    const queue = (window as unknown as {
      launchQueue?: { setConsumer(cb: (params: { files: ProjectFileHandle[] }) => void): void };
    }).launchQueue;
    queue?.setConsumer((params) => {
      if (params.files.length > 0) openLaunchedFileRef.current(params.files[0]);
    });
  }, []);

  const handleRestoreAutosave = (restore: boolean) => {
    if (restore && pendingRestore) {
      try {
        applyProjectText(pendingRestore.text, pendingRestore.name);
        markSavedOnRenderRef.current = false; // restored work still isn't in a file
      } catch {
        clearAutosave();
      }
    } else {
      clearAutosave();
    }
    setPendingRestore(null);
    autosaveReadyRef.current = true;
  };

  // Sync hidden video currentTime with timeline scrubber (while paused; playback drives itself)
  useEffect(() => {
    const v = videoEl;
    if (isPlaying || isExporting) return;
    if (v && videoBg.type !== 'color' && v.duration) {
      v.currentTime = videoTimeForFrame(currentFrame, fps, v.duration);
    }
  }, [currentFrame, fps, videoBg.type, videoEl, isPlaying, isExporting]);

  // Playback clock: wall-clock based requestAnimationFrame loop. The background video plays
  // natively and is only re-synced when it drifts, instead of being seeked on every frame.
  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;
  useEffect(() => {
    if (!isPlaying) return;
    const v = videoEl && videoBg.type !== 'color' ? videoEl : null;
    let baseFrame = currentFrameRef.current >= totalFrames ? 1 : currentFrameRef.current;
    let baseTime = performance.now();
    let raf = 0;

    if (v) {
      v.playbackRate = 1;
      v.currentTime = videoTimeForFrame(baseFrame, fps, v.duration);
      v.play().catch(() => undefined);
    }
    let stopAudio = playClips(audio, fps, frameTime(baseFrame, fps));

    const tick = (now: number) => {
      let frame = baseFrame + Math.floor(((now - baseTime) / 1000) * fps);
      if (frame > totalFrames) {
        if (!isLooping) {
          setCurrentFrame(totalFrames);
          setIsPlaying(false);
          return;
        }
        baseFrame = 1;
        baseTime = now;
        frame = 1;
        stopAudio();
        stopAudio = playClips(audio, fps, 0);
      }
      if (v && v.duration) {
        const expected = videoTimeForFrame(frame, fps, v.duration);
        if (Math.abs(v.currentTime - expected) > 0.25) v.currentTime = expected;
        if (v.paused) v.play().catch(() => undefined);
      }
      setCurrentFrame(frame);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      v?.pause();
      stopAudio();
    };
  }, [isPlaying, fps, totalFrames, isLooping, videoEl, videoBg.type, audio]);

  // Decode audio ahead of time (import, open, undo) so playback and scrubbing start instantly
  useEffect(() => prepareClips(audio), [audio]);

  // Audio scrubbing: stepping or dragging the playhead plays a snippet of the sound under it
  const [audioScrub, setAudioScrub] = useState(true);
  const lastScrubFrameRef = useRef(currentFrame);
  useEffect(() => {
    if (lastScrubFrameRef.current === currentFrame) return;
    lastScrubFrameRef.current = currentFrame;
    if (isPlaying || isExporting || !audioScrub || audio.length === 0) return;
    resumeAudio();
    scrubClips(audio, fps, currentFrame);
  }, [currentFrame, isPlaying, isExporting, audioScrub, audio, fps]);

  // Frame update handler
  const handleUpdateFrameData = useCallback(
    (frameNum: number, data: FrameData) => {
      history.pushSnapshot(t('history.editStage'), {
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
        history.pushSnapshot(t('history.deleteStickAll'), {
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
        history.pushSnapshot(t('history.deleteStickFrame', { frame: currentFrame }), {
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

    history.pushSnapshot(t('history.duplicateFrame', { from: currentFrame, to: nextFrameNum }), {
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
    history.pushSnapshot(t('history.clearFrame', { frame: currentFrame }), {
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

      history.pushSnapshot(t('history.breakStick'), {
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

      history.pushSnapshot(t('history.ungroup'), {
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
        name: t('app.newGroup', { n: Date.now().toString().slice(-4) }),
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        strokeIds: currentFrameData.drawings.map((d) => d.id),
      };

      history.pushSnapshot(t('history.group'), {
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
    let newName = t('app.newLayer');
    let newColor = '#38bdf8';
    let targetId: string | undefined = undefined;

    let updatedCharts = [...charts];
    let updatedTexts = [...texts];
    let updatedFrames = { ...history.present.frames };

    if (type === 'chart') {
      newName = t('timeline.layer.chart');
      newColor = '#0ea5e9';
      targetId = `chart-${Date.now()}`;
      const newChart: ChartOverlay = {
        id: targetId,
        title: t('app.newChartTitle'),
        type: 'bar',
        x: Math.round(canvasDimensions.width * 0.42),
        y: Math.round(canvasDimensions.height * 0.22),
        width: 480,
        height: 280,
        startFrame: currentFrame,
        durationFrames: 60, // 60 frames = 2.5s @ 24fps
        animationType: 'grow',
        data: [
          { label: shortMonth(0), value: 45, color: '#38bdf8' },
          { label: shortMonth(1), value: 90, color: '#0ea5e9' },
          { label: shortMonth(2), value: 65, color: '#6366f1' },
          { label: shortMonth(3), value: 110, color: '#10b981' },
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
      newName = t('timeline.layer.text');
      newColor = '#10b981';
      targetId = `text-${Date.now()}`;
      const newText: TextOverlay = {
        id: targetId,
        text: t('app.newText'),
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
      newName = t('timeline.layer.video');
      newColor = '#a855f7';
    } else if (type === 'group') {
      newName = t('timeline.layer.stick');
      newColor = '#f59e0b';
      targetId = `stick-${Date.now()}`;
      const newStick = createDefaultStickFigure(
        targetId,
        t('app.newStickNumbered', { n: Date.now() % 1000 }),
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
      newName = t('timeline.layer.drawing');
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

    history.pushSnapshot(t('history.add', { name: newName }), {
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
    let updatedFrames = history.present.frames;
    let updatedActors = actors;

    if (layer.targetId) {
      if (layer.type === 'chart') {
        updatedCharts = charts.filter((c) => c.id !== layer.targetId);
      } else if (layer.type === 'text') {
        updatedTexts = texts.filter((t) => t.id !== layer.targetId);
      } else if (layer.type === 'actor') {
        updatedActors = actors.filter((a) => a.id !== layer.targetId);
      } else if (layer.type === 'group') {
        // Stick figure layer: remove the figure from every frame, otherwise it stays on stage
        updatedFrames = {};
        for (const [fNum, fData] of Object.entries(history.present.frames)) {
          updatedFrames[Number(fNum)] = {
            ...fData,
            stickFigures: fData.stickFigures.filter((s) => s.id !== layer.targetId),
          };
        }
      }
    }

    if (layer.type === 'path' && layer.targetId) {
      handleDeletePath(layer.targetId);
      return;
    }

    history.pushSnapshot(t('history.deleteLayer', { name: layer.name }), {
      ...history.present,
      layers: layers.filter((l) => l.id !== layerId),
      charts: updatedCharts,
      texts: updatedTexts,
      frames: updatedFrames,
      actors: updatedActors,
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
    history.pushSnapshot(t('history.toggleLayerVisibility'), {
      ...history.present,
      layers: updated,
    });
  };

  const handleToggleLayerLock = (layerId: string) => {
    const updated = layers.map((l) =>
      l.id === layerId ? { ...l, locked: !l.locked } : l
    );
    history.pushSnapshot(t('history.toggleLayerLock'), {
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

    history.pushSnapshot(t('history.reorderLayers'), {
      ...history.present,
      layers: newLayers,
    });
  };

  const handleRenameLayer = (layerId: string, newName: string) => {
    const updated = layers.map((l) =>
      l.id === layerId ? { ...l, name: newName } : l
    );
    history.pushSnapshot(t('history.renameLayer', { name: newName }), {
      ...history.present,
      layers: updated,
    });
  };

  // ================= CHARTS & TEXTS HANDLERS =================
  const handleUpdateChart = (updatedChart: ChartOverlay) => {
    history.pushSnapshot(t('history.updateChart', { name: updatedChart.title }), {
      ...history.present,
      charts: charts.map((c) => (c.id === updatedChart.id ? updatedChart : c)),
    });
  };

  const handleDeleteChart = (chartId: string) => {
    history.pushSnapshot(t('history.deleteChart'), {
      ...history.present,
      charts: charts.filter((c) => c.id !== chartId),
    });
    if (selectedObject?.id === chartId) setSelectedObject(null);
  };

  const handleUpdateText = (updatedText: TextOverlay) => {
    history.pushSnapshot(t('history.updateText', { name: updatedText.text.slice(0, 15) }), {
      ...history.present,
      texts: texts.map((t) => (t.id === updatedText.id ? updatedText : t)),
    });
  };

  const handleDeleteText = (textId: string) => {
    history.pushSnapshot(t('history.deleteText'), {
      ...history.present,
      texts: texts.filter((t) => t.id !== textId),
    });
    if (selectedObject?.id === textId) setSelectedObject(null);
  };

  // ================= STICK FIGURE POSE ANIMATION (classic tween) =================
  const emptyFrameData = (frameNumber: number): FrameData => ({
    frameNumber,
    stickFigures: [],
    drawings: [],
    groups: [],
  });

  /** Returns frames with `stick` placed (replacing the same id) in frame `f`. */
  const withStickInFrame = (
    allFrames: Record<number, FrameData>,
    f: number,
    stick: StickFigure
  ): Record<number, FrameData> => {
    const data = allFrames[f] ?? emptyFrameData(f);
    const exists = data.stickFigures.some((s) => s.id === stick.id);
    return {
      ...allFrames,
      [f]: {
        ...data,
        stickFigures: exists
          ? data.stickFigures.map((s) => (s.id === stick.id ? stick : s))
          : [...data.stickFigures, stick],
      },
    };
  };

  const handleCopyStickToFrame = (stickId: string, toFrame: number) => {
    const stick = frames[currentFrame]?.stickFigures.find((s) => s.id === stickId);
    if (!stick || toFrame === currentFrame) return;
    history.pushSnapshot(t('history.copyPose', { from: currentFrame, to: toFrame }), {
      ...history.present,
      frames: withStickInFrame(history.present.frames, toFrame, { ...stick, tweened: false }),
    });
    if (toFrame > totalFrames) setTotalFrames(toFrame);
    setCurrentFrame(toFrame);
  };

  const handleTweenStick = (stickId: string, fromFrame: number, toFrame: number, easing: EasingName) => {
    const a = frames[fromFrame]?.stickFigures.find((s) => s.id === stickId);
    const b = frames[toFrame]?.stickFigures.find((s) => s.id === stickId);
    if (!a || !b) {
      alert(t('app.error.stickMissing', { from: fromFrame, to: toFrame }));
      return;
    }
    const poses = tweenStickFrames(a, b, fromFrame, toFrame, easing);
    let updated = history.present.frames;
    Object.entries(poses).forEach(([f, pose]) => {
      updated = withStickInFrame(updated, Number(f), pose);
    });
    history.pushSnapshot(t('history.tweenPose', { from: fromFrame, to: toFrame }), {
      ...history.present,
      frames: updated,
    });
  };

  // ================= ACTORS (imported images animated by keyframes) =================
  const handleAddActor = (params: { src: string; name: string; width: number; height: number }) => {
    const id = `actor-${Date.now()}`;
    const actor = createActor({
      id,
      name: params.name,
      src: params.src,
      width: params.width,
      height: params.height,
      x: Math.round(canvasDimensions.width / 2),
      y: Math.round(canvasDimensions.height / 2),
      startFrame: 1,
      durationFrames: Math.max(1, totalFrames - 1),
    });
    const layer: StudioLayer = {
      id: `layer-actor-${id}`,
      name: params.name,
      type: 'actor',
      visible: true,
      locked: false,
      color: '#f97316',
      targetId: id,
    };
    history.pushSnapshot(t('history.import', { name: params.name }), {
      ...history.present,
      actors: [...history.present.actors, actor],
      layers: [layer, ...history.present.layers],
    });
    setSelectedObject({ type: 'actor', id });
    setSelectedLayerId(layer.id);
  };

  const handleImportImageFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    for (const file of list) {
      try {
        const { src, width, height } = await loadImageFileAsActorSource(
          file,
          canvasDimensions.width,
          canvasDimensions.height
        );
        handleAddActor({ src, width, height, name: file.name.replace(/\.[^.]+$/, '') });
      } catch (err) {
        alert(t('app.error.import', { name: file.name, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  };

  const handleUpdateActor = (actor: ActorOverlay, description = t('history.edit', { name: actor.name })) => {
    history.pushSnapshot(description, {
      ...history.present,
      actors: history.present.actors.map((a) => (a.id === actor.id ? actor : a)),
    });
  };

  const handleTransientUpdateActor = useCallback(
    (actor: ActorOverlay) => {
      history.updatePresent((prev) => ({
        ...prev,
        actors: prev.actors.map((a) => (a.id === actor.id ? actor : a)),
      }));
    },
    [history]
  );

  const handleCommitActor = useCallback(
    (actor: ActorOverlay, description: string, baseSnapshot: HistorySnapshot) => {
      const current = history.presentRef.current;
      history.commitAction(description, baseSnapshot, {
        ...current,
        actors: current.actors.map((a) => (a.id === actor.id ? actor : a)),
      });
    },
    [history]
  );

  // ================= MOTION PATHS (drawn routes that actors can follow) =================
  const handleCreatePath = useCallback(
    (points: { x: number; y: number }[]) => {
      const present = history.presentRef.current;
      const id = `path-${Date.now()}`;
      const path: MotionPath = {
        id,
        name: t('app.newPath', { n: present.paths.length + 1 }),
        points,
        smooth: true,
        closed: false,
        style: { visible: true, color: '#f8fafc', width: 4, stroke: 'dotted', reveal: 'full' },
        startFrame: 1,
        durationFrames: Math.max(1, totalFrames - 1),
      };
      const layer: StudioLayer = {
        id: `layer-path-${id}`,
        name: path.name,
        type: 'path',
        visible: true,
        locked: false,
        color: '#38bdf8',
        targetId: id,
      };
      history.pushSnapshot(t('history.drawPath', { name: path.name }), {
        ...present,
        paths: [...present.paths, path],
        layers: [layer, ...present.layers],
      });
      setActiveTool('pointer');
      setSelectedObject({ type: 'path', id });
      setSelectedLayerId(layer.id);
    },
    [history, totalFrames]
  );

  const handleUpdatePath = (path: MotionPath, description = t('history.edit', { name: path.name })) => {
    history.pushSnapshot(description, {
      ...history.present,
      paths: history.present.paths.map((p) => (p.id === path.id ? path : p)),
    });
  };

  const handleTransientUpdatePath = useCallback(
    (path: MotionPath) => {
      history.updatePresent((prev) => ({ ...prev, paths: prev.paths.map((p) => (p.id === path.id ? path : p)) }));
    },
    [history]
  );

  const handleCommitPath = useCallback(
    (path: MotionPath, description: string, baseSnapshot: HistorySnapshot) => {
      const current = history.presentRef.current;
      history.commitAction(description, baseSnapshot, {
        ...current,
        paths: current.paths.map((p) => (p.id === path.id ? path : p)),
      });
    },
    [history]
  );

  /**
   * Links an actor to a path: it travels the whole path, eased, during the part of the timeline where
   * both are visible (the timing can be edited afterwards like any keyframes).
   */
  const handleAttachActorToPath = (actorId: string, pathId: string) => {
    const present = history.present;
    const path = present.paths.find((p) => p.id === pathId);
    const actor = present.actors.find((a) => a.id === actorId);
    if (!path || !actor) return;
    let start = Math.max(actor.startFrame, path.startFrame);
    let end = Math.min(actor.startFrame + actor.durationFrames, path.startFrame + path.durationFrames);
    if (end - start < 2) {
      start = actor.startFrame;
      end = actor.startFrame + actor.durationFrames;
    }
    const progress = buildFollowProgress({
      anchorProgress: samplePath(path).anchorProgress,
      startFrame: start,
      endFrame: end,
      easing: 'easeInOut',
      holdFrames: 0,
    });
    history.pushSnapshot(t('history.follow', { actor: actor.name, path: path.name }), {
      ...present,
      actors: present.actors.map((a) => (a.id === actorId ? { ...a, follow: { pathId, orient: true, progress } } : a)),
    });
    setSelectedObject({ type: 'actor', id: actorId });
  };

  /** Removes the path and unlinks actors that followed it (they keep their own position). */
  const withoutPath = (snapshot: HistorySnapshot, pathId: string): HistorySnapshot => ({
    ...snapshot,
    paths: snapshot.paths.filter((p) => p.id !== pathId),
    actors: snapshot.actors.map((a) => (a.follow?.pathId === pathId ? { ...a, follow: undefined } : a)),
    layers: snapshot.layers.filter((l) => l.targetId !== pathId),
  });

  const handleDeletePath = (pathId: string) => {
    const path = history.present.paths.find((p) => p.id === pathId);
    history.pushSnapshot(t('history.delete', { name: path?.name ?? t('selection.path') }), withoutPath(history.present, pathId));
    if (selectedObject?.id === pathId) setSelectedObject(null);
  };

  // ================= AUDIO CLIPS =================
  const replaceClip = (snapshot: HistorySnapshot, clip: AudioClip): HistorySnapshot => ({
    ...snapshot,
    audio: (snapshot.audio ?? []).map((c) => (c.id === clip.id ? clip : c)),
  });

  const handleImportAudioFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('audio/') || f.type.startsWith('video/'));
    for (const file of list) {
      try {
        const { src, sourceDuration } = await loadAudioFile(file);
        const clip: AudioClip = {
          id: `audio-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          src,
          sourceDuration,
          startFrame: 1,
          offset: 0,
          duration: sourceDuration,
          volume: 1,
          muted: false,
        };
        const present = history.presentRef.current;
        history.pushSnapshot(t('history.addAudio', { name: clip.name }), {
          ...present,
          audio: [...(present.audio ?? []), clip],
        });
        // The animation is timed to the sound: make sure the timeline covers it (never shrinks)
        setTotalFrames((total) => Math.max(total, framesToFitAudio([clip], fps)));
      } catch (err) {
        alert(t('app.error.import', { name: file.name, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  };

  const handleUpdateAudioClip = (clip: AudioClip, description = t('history.edit', { name: clip.name })) => {
    history.pushSnapshot(description, replaceClip(history.present, clip));
  };

  const handleTransientUpdateAudioClip = useCallback(
    (clip: AudioClip) => history.updatePresent((prev) => replaceClip(prev, clip)),
    [history]
  );

  const handleCommitAudioClip = useCallback(
    (clip: AudioClip, description: string, baseSnapshot: HistorySnapshot) => {
      history.commitAction(description, baseSnapshot, replaceClip(history.presentRef.current, clip));
    },
    [history]
  );

  const handleDeleteAudioClip = (clipId: string) => {
    const clip = audio.find((c) => c.id === clipId);
    history.pushSnapshot(t('history.delete', { name: clip?.name ?? '' }), {
      ...history.present,
      audio: audio.filter((c) => c.id !== clipId),
    });
  };

  /**
   * Files dropped on the stage: images become actors and sounds become audio clips. A dropped video is
   * ambiguous (background or its sound?), so only the explicit "+ Audio" button takes videos.
   */
  const handleImportFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const imageFiles = list.filter((f) => f.type.startsWith('image/'));
    const sounds = list.filter((f) => f.type.startsWith('audio/'));
    if (imageFiles.length) handleImportImageFiles(imageFiles);
    if (sounds.length) handleImportAudioFiles(sounds);
  };

  // ================= MAP ROUTE TEMPLATE =================
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);

  const handleCreateRoute = async (req: RouteRequest) => {
    // The map data (~750 KB) is only loaded when this template is used
    const { loadWorld, makeProjection, renderMapImage, countryAnchor, DEFAULT_MAP_STYLE } = await import(
      './map/worldMap'
    );
    const world = await loadWorld();
    const W = canvasDimensions.width;
    const H = canvasDimensions.height;
    const ids = req.stops.map((c) => c.id);
    const projection = makeProjection(world, W, H, req.framing, ids);
    const mapSrc = renderMapImage(world, projection, W, H, DEFAULT_MAP_STYLE, req.highlight ? ids : []);
    const stops = req.stops.map((c) => {
      const [x, y] = projection(countryAnchor(c)) ?? [W / 2, H / 2];
      return { name: c.name, x: Math.round(x), y: Math.round(y) };
    });
    const stamp = Date.now();
    const route = buildRouteTemplate(
      stops,
      {
        fps,
        secondsPerLeg: req.secondsPerLeg,
        pauseSeconds: req.pauseSeconds,
        landedScale: 0.7,
        arc: req.arc ? 0.18 : 0,
      },
      `path-route-${stamp}`
    );
    const newTotal = Math.max(totalFrames, route.endFrame);
    const present = history.presentRef.current;

    const mapActor = createActor({
      id: `actor-map-${stamp}`,
      name: t('app.map'),
      src: mapSrc,
      width: W,
      height: H,
      x: W / 2,
      y: H / 2,
      startFrame: 1,
      durationFrames: newTotal - 1,
    });
    // The vehicle is just an actor following the route path (any imported image works)
    const existingVehicle = present.actors.find((a) => a.id === req.vehicleActorId);
    const vehicleWidth = Math.round(W * 0.07);
    const baseVehicle =
      existingVehicle ??
      createActor({
        id: `actor-plane-${stamp}`,
        name: t('app.plane'),
        src: PLANE_ICON_SRC,
        width: vehicleWidth,
        height: Math.round(vehicleWidth * PLANE_ICON_ASPECT),
        x: stops[0].x,
        y: stops[0].y,
        startFrame: 1,
        durationFrames: route.endFrame - 1,
      });
    const vehicle: ActorOverlay = {
      ...baseVehicle,
      startFrame: 1,
      durationFrames: Math.max(baseVehicle.durationFrames, route.endFrame - 1),
      follow: route.follow,
      tracks: { ...baseVehicle.tracks, scale: route.scale },
    };
    const path = { ...route.path, name: t('app.routePathName', { stops: stops.map((s) => s.name).join(' → ') }) };

    const layerFor = (id: string, name: string, type: 'actor' | 'path', locked = false): StudioLayer => ({
      id: `layer-${type}-${id}`,
      name,
      type,
      visible: true,
      locked,
      color: locked ? '#64748b' : type === 'path' ? '#38bdf8' : '#f97316',
      targetId: id,
    });
    // Map at the back (just above the video/background layer), locked so clicks reach the rest
    let layersNext = [...present.layers];
    const videoIndex = layersNext.findIndex((l) => l.type === 'video');
    layersNext.splice(
      videoIndex === -1 ? layersNext.length : videoIndex,
      0,
      layerFor(mapActor.id, mapActor.name, 'actor', true)
    );
    layersNext = [
      ...(existingVehicle ? [] : [layerFor(vehicle.id, vehicle.name, 'actor')]),
      layerFor(path.id, path.name, 'path'),
      ...layersNext,
    ];

    history.pushSnapshot(t('history.mapRoute', { stops: stops.map((s) => s.name).join(' → ') }), {
      ...present,
      actors: [
        mapActor,
        ...present.actors.map((a) => (a.id === vehicle.id ? vehicle : a)),
        ...(existingVehicle ? [] : [vehicle]),
      ],
      paths: [...present.paths, path],
      texts: req.labels
        ? [...present.texts, ...buildStopLabels(stops, route.arrivals, route.endFrame, W, `route-${stamp}`)]
        : present.texts,
      layers: layersNext,
    });
    setTotalFrames(newTotal);
    setCurrentFrame(1);
    setSelectedObject({ type: 'actor', id: vehicle.id });
    setRouteDialogOpen(false);
  };

  const handleDeleteActor = (actorId: string) => {
    const actor = history.present.actors.find((a) => a.id === actorId);
    history.pushSnapshot(t('history.delete', { name: actor?.name ?? t('selection.actor') }), {
      ...history.present,
      actors: history.present.actors.filter((a) => a.id !== actorId),
      layers: history.present.layers.filter((l) => l.targetId !== actorId),
    });
    if (selectedObject?.id === actorId) setSelectedObject(null);
  };

  // ================= KEYBOARD SHORTCUTS =================
  // Flash-standard Ctrl+Z, Ctrl+Y, Ctrl+G, Ctrl+B, Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // File shortcuts work everywhere, even while typing in a field
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject(e.shiftKey);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenProject();
        return;
      }
      if (isTypingTarget(e.target)) return;

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
          else if (selectedObject.type === 'actor') handleDeleteActor(selectedObject.id);
          else if (selectedObject.type === 'path') handleDeletePath(selectedObject.id);
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
      const baseStick = createDefaultStickFigure('stick-presenter', t('app.scene.teacher'), 240, 430);
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

      history.pushSnapshot(t('history.loadScene', { name: t('header.example.presenter') }), {
        ...history.present,
        frames: newFrames,
        charts: initialCharts,
        texts: initialTexts,
      });

      setCurrentFrame(1);
      setSelectedObject({ type: 'stick', id: 'stick-presenter' });
    } else if (presetName === 'walkcycle') {
      const newFrames: Record<number, FrameData> = {};
      const baseStick = createDefaultStickFigure('stick-walker', t('app.scene.walker'), 150, 420);

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

      history.pushSnapshot(t('history.loadScene', { name: t('header.example.walkcycle') }), {
        ...history.present,
        frames: newFrames,
      });

      setCurrentFrame(1);
      setSelectedObject({ type: 'stick', id: 'stick-walker' });
    } else if (presetName === 'action') {
      const newFrames: Record<number, FrameData> = {};
      const fighter = createDefaultStickFigure('stick-action', t('app.scene.acrobat'), 280, 420);
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

      history.pushSnapshot(t('history.loadScene', { name: t('header.example.action') }), {
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
    history.pushSnapshot(t('history.resetProject'), {
      ...history.present,
      frames: emptyFrames,
      charts: [],
      texts: [],
      images: [],
      actors: [],
      paths: [],
      audio: [],
      layers: history.present.layers.filter((l) => l.type !== 'actor' && l.type !== 'path'),
    });
    setCurrentFrame(1);
  };

  // Video Upload
  const handleUploadVideo = (file: File) => {
    if (videoBg.url?.startsWith('blob:')) URL.revokeObjectURL(videoBg.url);
    fitTimelineToVideoRef.current = true;
    setVideoFileName(file.name);
    const objectUrl = URL.createObjectURL(file);
    setVideoBg({
      type: 'upload',
      url: objectUrl,
      opacity: 0.85,
      playbackRate: 1,
    });
  };

  // Export Video
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const handleExportVideo = async (request: ExportRequest) => {
    setIsExporting(true);
    setExportProgress(0);
    setIsPlaying(false);

    try {
      const sound = request.includeAudio
        ? await mixdown(audio, fps, request.startFrame, request.endFrame)
        : null;
      const { blob, extension, audioDropped } = await exportVideoSequence(sceneContent(), {
        totalFrames,
        fps,
        width: canvasDimensions.width,
        height: canvasDimensions.height,
        onProgress: (progress) => setExportProgress(progress),
        format: request.format,
        startFrame: request.startFrame,
        endFrame: request.endFrame,
        audio: sound,
      });
      if (audioDropped) alert(t('app.audioDropped'));

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = request.format === 'webm-alpha' ? '-transparente' : '';
      a.download = `${projectName}${suffix}.${extension}`;
      a.click();
      // Revoking synchronously can cancel the download before the browser starts it
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportDialogOpen(false);
    } catch (err) {
      console.error('Export error:', err);
      alert(t('app.error.export', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Clean render of the current frame (no editor grid or selection handles)
  const sceneContent = () => ({
    frames,
    charts,
    texts,
    images,
    actors,
    paths,
    layers,
    videoBg,
    videoElement: videoEl,
  });
  const currentFrameRenderParams = () => ({
    width: canvasDimensions.width,
    height: canvasDimensions.height,
    frame: currentFrame,
    scene: sceneContent(),
  });

  // Snapshot PNG
  const handleSnapshot = () => {
    exportFramePNG(currentFrameRenderParams(), `frame-${currentFrame}-snapshot.png`);
  };

  // Open AI Image Modal
  const handleOpenAiImage = async () => {
    setCanvasSnapshot(await renderFrameToDataURL(currentFrameRenderParams()));
    setAiModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans">
      {/* Hidden Video element for background video frame grabbing */}
      {videoBg.url && (
        <video
          ref={setVideoEl}
          src={videoBg.url}
          onLoadedMetadata={(e) => {
            if (!fitTimelineToVideoRef.current) return;
            fitTimelineToVideoRef.current = false;
            const duration = e.currentTarget.duration;
            if (Number.isFinite(duration) && duration > 0) {
              setTotalFrames(Math.max(1, Math.round(duration * fps)));
            }
          }}
          crossOrigin="anonymous"
          muted
          playsInline
          className="hidden"
        />
      )}

      {/* Top Flash Studio Header with History & Grouping controls */}
      <StudioHeader
        onExportVideo={() => setExportDialogOpen(true)}
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
        projectName={projectName}
        isDirty={isDirty}
        onOpenProject={handleOpenProject}
        onSaveProject={() => handleSaveProject(false)}
      />

      {pendingRestore && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-3 text-xs text-amber-100 shrink-0">
          <span className="flex-1">
            {t('app.restore.message', {
              name: pendingRestore.name,
              date: new Date(pendingRestore.savedAt).toLocaleString(locale),
            })}
          </span>
          <button
            onClick={() => handleRestoreAutosave(true)}
            className="px-3 py-1 rounded bg-amber-500 text-neutral-950 font-semibold hover:bg-amber-400"
          >
            {t('app.restore.restore')}
          </button>
          <button
            onClick={() => handleRestoreAutosave(false)}
            className="px-3 py-1 rounded border border-amber-500/40 hover:bg-amber-500/10"
          >
            {t('app.restore.discard')}
          </button>
        </div>
      )}

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
            videoElement={videoEl}
            isPlaying={isPlaying}
            layers={layers}
            onGroupSelected={handleGroupSelected}
            onUngroupSelected={handleUngroupSelected}
            onDeleteStickFigure={handleDeleteStickFigure}
            canvasWidth={canvasDimensions.width}
            canvasHeight={canvasDimensions.height}
            getCurrentSnapshot={() => history.presentRef.current}
            actors={actors}
            onTransientUpdateActor={handleTransientUpdateActor}
            onCommitActor={handleCommitActor}
            onImportImageFiles={handleImportFiles}
            paths={paths}
            onCreatePath={handleCreatePath}
            onTransientUpdatePath={handleTransientUpdatePath}
            onCommitPath={handleCommitPath}
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
              title: t('app.newChart'),
              type: chartType || 'bar',
              x: Math.round(canvasDimensions.width * 0.5),
              y: Math.round(canvasDimensions.height * 0.22),
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
            history.pushSnapshot(t('history.add', { name: newChart.title }), {
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
              text: isNumber ? t('app.newCounter') : t('app.newText'),
              x: Math.round(canvasDimensions.width * 0.5),
              y: Math.round(canvasDimensions.height * 0.3),
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
            history.pushSnapshot(t('history.add', { name: isNumber ? t('app.newCounter') : t('selection.text') }), {
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
              t('app.newStick'),
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
          onUploadVideo={handleUploadVideo}
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
          actors={actors}
          onUpdateActor={handleUpdateActor}
          onDeleteActor={handleDeleteActor}
          onImportImageFiles={handleImportImageFiles}
          onJumpToFrame={setCurrentFrame}
          frames={frames}
          onCopyStickToFrame={handleCopyStickToFrame}
          onTweenStick={handleTweenStick}
          onOpenRouteDialog={() => setRouteDialogOpen(true)}
          paths={paths}
          onUpdatePath={handleUpdatePath}
          onDeletePath={handleDeletePath}
          onAttachActorToPath={handleAttachActorToPath}
        />
      </div>

      {/* Draggable Divider to Expand/Shrink Timeline & Stage */}
      <div
        onMouseDown={startResizeTimeline}
        className="h-2 w-full bg-neutral-900 hover:bg-sky-500/30 cursor-row-resize flex items-center justify-center transition select-none group border-t border-neutral-800 shrink-0"
        title={t('app.timelineResize')}
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
          getCurrentSnapshot={() => history.presentRef.current}
          onJumpToFrame={setCurrentFrame}
          actors={actors}
          onUpdateActor={handleTransientUpdateActor}
          onCommitActor={handleCommitActor}
          paths={paths}
          onUpdatePath={handleTransientUpdatePath}
          onCommitPath={handleCommitPath}
          audioClips={audio}
          onImportAudioFiles={handleImportAudioFiles}
          onUpdateAudioClip={handleUpdateAudioClip}
          onTransientUpdateAudioClip={handleTransientUpdateAudioClip}
          onCommitAudioClip={handleCommitAudioClip}
          onDeleteAudioClip={handleDeleteAudioClip}
          audioScrub={audioScrub}
          setAudioScrub={setAudioScrub}
        />
      </div>

      <ExportDialog
        isOpen={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExportVideo}
        isExporting={isExporting}
        progress={exportProgress}
        totalFrames={totalFrames}
        fps={fps}
        width={canvasDimensions.width}
        height={canvasDimensions.height}
        hasBackgroundVideo={videoBg.type !== 'color' && !!videoBg.url}
        audibleClips={audio.filter((c) => !c.muted && c.volume > 0).length}
      />

      <PwaStatus hasUnsavedChanges={isDirty} />

      <RouteDialog
        isOpen={routeDialogOpen}
        onClose={() => setRouteDialogOpen(false)}
        onCreate={handleCreateRoute}
        actors={actors}
        fps={fps}
      />

      {/* AI Image Generation & Editing Modal */}
      <AiImageModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        canvasSnapshot={canvasSnapshot}
        onAddImageOverlay={(img) => {
          handleAddActor({ src: img.url, name: t('app.aiImageName'), width: img.width, height: img.height });
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
