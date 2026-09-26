import React, { useState } from 'react';
import {
  Sliders,
  BarChart3,
  Type,
  User,
  Plus,
  Trash2,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  FolderOpen,
  History,
  Copy,
  Ungroup,
  Group,
  TrendingUp,
  PieChart,
  Hash,
  Palette,
  Check,
  Zap,
  Upload,
  VideoOff,
  Image as ImageIcon,
  Globe2,
} from 'lucide-react';
import {
  ChartOverlay,
  ChartDataPoint,
  TextOverlay,
  VideoBackground,
  ChartType,
  TextEffect,
  SelectedObjectRef,
  FrameData,
  StickFigure,
  CanvasGroup,
  HistorySnapshot,
  ActorOverlay,
  MotionPath,
} from '../types';
import { ActorInspector } from './ActorInspector';
import { PathInspector } from './PathInspector';
import { StickAnimationPanel } from './StickAnimationPanel';
import { useI18n } from '../i18n';
import type { EasingName } from '../engine/keyframes';
import { STICK_POSE_PRESETS, applyPoseToStickFigure } from '../utils/stickFigurePresets';

interface PropertiesInspectorProps {
  selectedObject: SelectedObjectRef | null;
  onSelectObject: (ref: SelectedObjectRef | null) => void;
  // Charts
  charts: ChartOverlay[];
  onUpdateChart: (chart: ChartOverlay) => void;
  onDeleteChart: (id: string) => void;
  onAddChart: (type?: ChartType) => void;
  // Texts
  texts: TextOverlay[];
  onUpdateText: (text: TextOverlay) => void;
  onDeleteText: (id: string) => void;
  onAddText: (isNumber?: boolean) => void;
  // Stick Figures & Groups
  currentFrame: number;
  currentFrameData: FrameData;
  onUpdateFrameData: (frameNum: number, data: FrameData) => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onAddStickFigure: () => void;
  // Document Properties
  fps: number;
  setFps: (fps: number) => void;
  totalFrames: number;
  setTotalFrames: (total: number) => void;
  videoBg: VideoBackground;
  setVideoBg: React.Dispatch<React.SetStateAction<VideoBackground>>;
  onUploadVideo: (file: File) => void;
  // Canvas Dimensions & Presets (YouTube, Shorts, etc.)
  canvasDimensions: import('../types').CanvasDimensions;
  onUpdateCanvasDimensions: (dim: import('../types').CanvasDimensions) => void;
  // Timeline height
  timelineHeight: number;
  setTimelineHeight: (h: number | ((prev: number) => number)) => void;
  // Stick Figure deletion
  onDeleteStickFigure?: (stickId: string, allFrames?: boolean) => void;
  // Actors (imported images)
  actors: ActorOverlay[];
  onUpdateActor: (actor: ActorOverlay, description: string) => void;
  onDeleteActor: (id: string) => void;
  onImportImageFiles: (files: FileList) => void;
  onJumpToFrame: (frame: number) => void;
  // Stick figure pose tween
  frames: Record<number, FrameData>;
  onCopyStickToFrame: (stickId: string, toFrame: number) => void;
  onTweenStick: (stickId: string, fromFrame: number, toFrame: number, easing: EasingName) => void;
  onOpenRouteDialog: () => void;
  // Motion paths
  paths: MotionPath[];
  onUpdatePath: (path: MotionPath, description: string) => void;
  onDeletePath: (id: string) => void;
  onAttachActorToPath: (actorId: string, pathId: string) => void;
  // History
  pastSteps: HistorySnapshot[];
  futureSteps: HistorySnapshot[];
  onJumpToHistory: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const PropertiesInspector: React.FC<PropertiesInspectorProps> = ({
  selectedObject,
  onSelectObject,
  charts,
  onUpdateChart,
  onDeleteChart,
  onAddChart,
  texts,
  onUpdateText,
  onDeleteText,
  onAddText,
  currentFrame,
  currentFrameData,
  onUpdateFrameData,
  onGroupSelected,
  onUngroupSelected,
  onAddStickFigure,
  fps,
  setFps,
  totalFrames,
  setTotalFrames,
  videoBg,
  setVideoBg,
  onUploadVideo,
  canvasDimensions,
  onUpdateCanvasDimensions,
  timelineHeight,
  setTimelineHeight,
  onDeleteStickFigure,
  actors,
  onUpdateActor,
  onDeleteActor,
  onImportImageFiles,
  onJumpToFrame,
  frames,
  onCopyStickToFrame,
  onTweenStick,
  onOpenRouteDialog,
  paths,
  onUpdatePath,
  onDeletePath,
  onAttachActorToPath,
  pastSteps,
  futureSteps,
  onJumpToHistory,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'properties' | 'library' | 'history'>('properties');

  // Find active items
  const activeChart =
    selectedObject?.type === 'chart'
      ? charts.find((c) => c.id === selectedObject.id)
      : null;

  const activeText =
    selectedObject?.type === 'text'
      ? texts.find((t) => t.id === selectedObject.id)
      : null;

  const activeActor =
    selectedObject?.type === 'actor' ? actors.find((a) => a.id === selectedObject.id) : undefined;

  const activePath =
    selectedObject?.type === 'path' ? paths.find((p) => p.id === selectedObject.id) : undefined;

  const activeStick =
    selectedObject?.type === 'stick'
      ? currentFrameData.stickFigures.find((s) => s.id === selectedObject.id)
      : null;

  const activeGroup =
    selectedObject?.type === 'group'
      ? currentFrameData.groups?.find((g) => g.id === selectedObject.id)
      : null;

  // Chart data handlers
  const handleChartDataChange = (
    index: number,
    field: keyof ChartDataPoint,
    value: any
  ) => {
    if (!activeChart) return;
    const newData = [...activeChart.data];
    newData[index] = {
      ...newData[index],
      [field]: field === 'value' ? Math.max(0, Number(value) || 0) : value,
    };
    onUpdateChart({ ...activeChart, data: newData });
  };

  const handleAddChartPoint = () => {
    if (!activeChart) return;
    const colors = ['#38bdf8', '#0ea5e9', '#0284c7', '#22c55e', '#eab308', '#f97316', '#ec4899'];
    const nextColor = colors[activeChart.data.length % colors.length];
    const newPoint: ChartDataPoint = {
      label: t('inspector.chart.newItem', { n: activeChart.data.length + 1 }),
      value: 50 + Math.round(Math.random() * 50),
      color: nextColor,
    };
    onUpdateChart({ ...activeChart, data: [...activeChart.data, newPoint] });
  };

  const handleRemoveChartPoint = (index: number) => {
    if (!activeChart || activeChart.data.length <= 1) return;
    const newData = activeChart.data.filter((_, i) => i !== index);
    onUpdateChart({ ...activeChart, data: newData });
  };

  const handleApplyChartPreset = (presetKey: string) => {
    if (!activeChart) return;
    if (presetKey === 'sales') {
      onUpdateChart({
        ...activeChart,
        title: t('inspector.sample.salesTitle'),
        type: 'bar',
        data: [
          { label: 'Jan', value: 45, color: '#38bdf8' },
          { label: 'Fev', value: 75, color: '#0ea5e9' },
          { label: 'Mar', value: 110, color: '#0284c7' },
          { label: 'Abr', value: 165, color: '#22c55e' },
        ],
      });
    } else if (presetKey === 'retention') {
      onUpdateChart({
        ...activeChart,
        title: t('inspector.sample.retentionTitle'),
        type: 'line',
        data: [
          { label: t('inspector.sample.week1'), value: 100, color: '#38bdf8' },
          { label: t('inspector.sample.week2'), value: 88, color: '#38bdf8' },
          { label: t('inspector.sample.week3'), value: 79, color: '#38bdf8' },
          { label: t('inspector.sample.week4'), value: 74, color: '#38bdf8' },
        ],
      });
    } else if (presetKey === 'share') {
      onUpdateChart({
        ...activeChart,
        title: t('inspector.sample.engagementTitle'),
        type: 'donut',
        data: [
          { label: t('inspector.sample.interactiveVideo'), value: 68, color: '#38bdf8' },
          { label: t('inspector.sample.staticReading'), value: 32, color: '#334155' },
        ],
      });
    }
  };

  return (
    <aside className="w-80 h-full bg-neutral-950 border-l border-neutral-800 flex flex-col shrink-0 select-none text-xs">
      {/* Top Panel Tabs (Flash CS Inspector Style) */}
      <div className="h-10 px-2 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            id="tab-properties-btn"
            onClick={() => setActiveTab('properties')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition ${
              activeTab === 'properties'
                ? 'bg-neutral-800 text-sky-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sliders size={13} />
            {t('inspector.tab.properties')}
          </button>

          <button
            id="tab-library-btn"
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition ${
              activeTab === 'library'
                ? 'bg-neutral-800 text-sky-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <FolderOpen size={13} />
            {t('inspector.tab.library')}
          </button>

          <button
            id="tab-history-btn"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-neutral-800 text-sky-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <History size={13} />
            {t('inspector.tab.history')}
            {pastSteps.length > 0 && (
              <span className="ml-0.5 px-1 py-0.2 rounded-full bg-sky-950 text-sky-400 text-[10px] font-mono">
                {pastSteps.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* ================= TAB 1: PROPERTIES (CONTEXTUAL) ================= */}
        {activeTab === 'properties' && (
          <>
            {activePath && (
              <PathInspector
                path={activePath}
                actors={actors}
                totalFrames={totalFrames}
                onChange={onUpdatePath}
                onDelete={onDeletePath}
                onAttachActor={onAttachActorToPath}
                onSelectActor={(id) => onSelectObject({ type: 'actor', id })}
              />
            )}

            {activeActor && (
              <ActorInspector
                actor={activeActor}
                currentFrame={currentFrame}
                totalFrames={totalFrames}
                fps={fps}
                onChange={onUpdateActor}
                onDelete={onDeleteActor}
                onJumpToFrame={onJumpToFrame}
                paths={paths}
                onAttachToPath={onAttachActorToPath}
                onSelectPath={(id) => onSelectObject({ type: 'path', id })}
              />
            )}

            {/* 1. CHART SELECTED */}
            {activeChart && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      <BarChart3 size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">{t('inspector.chart.title')}</h4>
                      <p className="text-[10px] text-neutral-400">{t('inspector.chart.subtitle')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onDeleteChart(activeChart.id)}
                    title={t('inspector.chart.delete')}
                    className="p-1.5 rounded hover:bg-rose-950/40 text-neutral-400 hover:text-rose-400 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Title & Type */}
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                      {t('inspector.chart.chartTitle')}
                    </label>
                    <input
                      type="text"
                      value={activeChart.title}
                      onChange={(e) => onUpdateChart({ ...activeChart, title: e.target.value })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-white font-medium focus:border-sky-500 outline-none text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                      {t('inspector.chart.type')}
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['bar', 'donut', 'line', 'stat'] as ChartType[]).map((chartType) => (
                        <button
                          key={chartType}
                          onClick={() => onUpdateChart({ ...activeChart, type: chartType })}
                          className={`py-1.5 px-2 rounded text-[11px] font-medium uppercase transition ${
                            activeChart.type === chartType
                              ? 'bg-sky-500 text-neutral-950 font-bold shadow-sm'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                          }`}
                        >
                          {chartType === 'bar'
                            ? t('inspector.chart.type.bar')
                            : chartType === 'donut'
                            ? t('inspector.chart.type.donut')
                            : chartType === 'line'
                            ? t('inspector.chart.type.line')
                            : t('inspector.chart.type.stat')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Presets */}
                <div>
                  <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                    {t('inspector.chart.examples')}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleApplyChartPreset('sales')}
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-[10px] transition"
                    >
                      {t('inspector.chart.example.sales')}
                    </button>
                    <button
                      onClick={() => handleApplyChartPreset('retention')}
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-[10px] transition"
                    >
                      {t('inspector.chart.example.retention')}
                    </button>
                    <button
                      onClick={() => handleApplyChartPreset('share')}
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-[10px] transition"
                    >
                      {t('inspector.chart.example.distribution')}
                    </button>
                  </div>
                </div>

                {/* Spreadsheet Data Table */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                      {t('inspector.chart.data', { count: activeChart.data.length })}
                    </label>
                    <button
                      onClick={handleAddChartPoint}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 text-[10px] font-medium transition"
                    >
                      <Plus size={11} />
                      {t('inspector.chart.addPoint')}
                    </button>
                  </div>

                  <div className="space-y-1.5 bg-neutral-900/60 p-2 rounded-lg border border-neutral-800/80 max-h-48 overflow-y-auto">
                    {activeChart.data.map((point, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={point.color || '#38bdf8'}
                          onChange={(e) => handleChartDataChange(idx, 'color', e.target.value)}
                          className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer shrink-0"
                          title={t('inspector.chart.itemColor')}
                        />
                        <input
                          type="text"
                          value={point.label}
                          onChange={(e) => handleChartDataChange(idx, 'label', e.target.value)}
                          placeholder={t('inspector.chart.label')}
                          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-white text-xs outline-none focus:border-sky-500"
                        />
                        <input
                          type="number"
                          value={point.value}
                          onChange={(e) => handleChartDataChange(idx, 'value', e.target.value)}
                          placeholder={t('inspector.chart.value')}
                          className="w-16 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-right text-sky-400 font-mono text-xs outline-none focus:border-sky-500"
                        />
                        {activeChart.data.length > 1 && (
                          <button
                            onClick={() => handleRemoveChartPoint(idx)}
                            className="p-1 hover:bg-rose-950/40 text-neutral-500 hover:text-rose-400 rounded transition"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Animation Type & Timing */}
                <div className="space-y-2 pt-2 border-t border-neutral-800">
                  <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">
                    {t('inspector.chart.animation')}
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'grow', label: t('inspector.chart.anim.grow') },
                      { id: 'bounce', label: t('inspector.chart.anim.bounce') },
                      { id: 'slideUp', label: t('inspector.anim.slide') },
                      { id: 'fade', label: t('inspector.chart.anim.fade') },
                      { id: 'elastic', label: t('inspector.chart.anim.elastic') },
                    ].map((anim) => (
                      <button
                        key={anim.id}
                        onClick={() =>
                          onUpdateChart({
                            ...activeChart,
                            animationType: anim.id as any,
                          })
                        }
                        className={`py-1 px-1.5 rounded text-[10px] transition ${
                          activeChart.animationType === anim.id
                            ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50 font-bold'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
                        }`}
                      >
                        {anim.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-neutral-400">{t('inspector.startFrame')}</span>
                      <input
                        type="number"
                        min="1"
                        max={totalFrames}
                        value={activeChart.startFrame}
                        onChange={(e) =>
                          onUpdateChart({
                            ...activeChart,
                            startFrame: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-200 font-mono text-xs focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400">{t('inspector.durationFrames')}</span>
                      <input
                        type="number"
                        min="10"
                        max="240"
                        value={activeChart.durationFrames}
                        onChange={(e) =>
                          onUpdateChart({
                            ...activeChart,
                            durationFrames: Math.max(10, Number(e.target.value)),
                          })
                        }
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-200 font-mono text-xs focus:border-sky-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. TEXT OR NUMBER COUNTER SELECTED */}
            {activeText && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {activeText.isNumberCounter ? <Hash size={16} /> : <Type size={16} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">
                        {activeText.isNumberCounter ? t('inspector.text.counter') : t('inspector.text.kinetic')}
                      </h4>
                      <p className="text-[10px] text-neutral-400">{t('inspector.text.subtitle')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onDeleteText(activeText.id)}
                    title={t('inspector.text.delete')}
                    className="p-1.5 rounded hover:bg-rose-950/40 text-neutral-400 hover:text-rose-400 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Mode toggle: Plain text vs Number counter */}
                <div className="flex bg-neutral-900 rounded p-1 border border-neutral-800">
                  <button
                    onClick={() => onUpdateText({ ...activeText, isNumberCounter: false })}
                    className={`flex-1 py-1 rounded text-center font-medium transition ${
                      !activeText.isNumberCounter
                        ? 'bg-sky-500 text-neutral-950 font-bold'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {t('inspector.text.normal')}
                  </button>
                  <button
                    onClick={() =>
                      onUpdateText({
                        ...activeText,
                        isNumberCounter: true,
                        counterStart: activeText.counterStart ?? 0,
                        counterEnd: activeText.counterEnd ?? 1000,
                        counterPrefix: activeText.counterPrefix ?? 'R$ ',
                        counterSuffix: activeText.counterSuffix ?? '',
                      })
                    }
                    className={`flex-1 py-1 rounded text-center font-medium transition ${
                      activeText.isNumberCounter
                        ? 'bg-sky-500 text-neutral-950 font-bold'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {t('inspector.text.counter')}
                  </button>
                </div>

                {/* Text Content Inputs */}
                {!activeText.isNumberCounter ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                        {t('inspector.text.main')}
                      </label>
                      <input
                        type="text"
                        value={activeText.text}
                        onChange={(e) => onUpdateText({ ...activeText, text: e.target.value })}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-white font-semibold focus:border-sky-500 outline-none text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                        {t('inspector.text.subtitleField')}
                      </label>
                      <input
                        type="text"
                        value={activeText.subtitle || ''}
                        onChange={(e) =>
                          onUpdateText({ ...activeText, subtitle: e.target.value })
                        }
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-300 focus:border-sky-500 outline-none text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                        {t('inspector.text.badge')}
                      </label>
                      <input
                        type="text"
                        value={activeText.badge || ''}
                        onChange={(e) => onUpdateText({ ...activeText, badge: e.target.value })}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-sky-400 font-mono text-xs focus:border-sky-500 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  /* Number Counter Parameters */
                  <div className="space-y-2 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1">{t('inspector.text.startValue')}</span>
                        <input
                          type="number"
                          value={activeText.counterStart ?? 0}
                          onChange={(e) =>
                            onUpdateText({
                              ...activeText,
                              counterStart: Number(e.target.value),
                            })
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-white font-mono text-xs focus:border-sky-500 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1">{t('inspector.text.endValue')}</span>
                        <input
                          type="number"
                          value={activeText.counterEnd ?? 1000}
                          onChange={(e) =>
                            onUpdateText({
                              ...activeText,
                              counterEnd: Number(e.target.value),
                            })
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-emerald-400 font-mono text-xs font-bold focus:border-sky-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1">{t('inspector.text.prefix')}</span>
                        <input
                          type="text"
                          placeholder={t('inspector.text.prefixExample')}
                          value={activeText.counterPrefix || ''}
                          onChange={(e) =>
                            onUpdateText({
                              ...activeText,
                              counterPrefix: e.target.value,
                            })
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-300 font-mono text-xs focus:border-sky-500 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1">{t('inspector.text.suffix')}</span>
                        <input
                          type="text"
                          placeholder={t('inspector.text.suffixExample')}
                          value={activeText.counterSuffix || ''}
                          onChange={(e) =>
                            onUpdateText({
                              ...activeText,
                              counterSuffix: e.target.value,
                            })
                          }
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-300 font-mono text-xs focus:border-sky-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Text Animation Effect */}
                <div className="space-y-2 pt-2 border-t border-neutral-800">
                  <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">
                    {t('inspector.text.effect')}
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'typewriter', label: t('inspector.text.effect.typewriter') },
                      { id: 'bouncePop', label: t('inspector.text.effect.bouncePop') },
                      { id: 'numberRoll', label: t('inspector.text.effect.numberRoll') },
                      { id: 'slideLeft', label: t('inspector.anim.slide') },
                      { id: 'glowPulse', label: t('inspector.text.effect.glowPulse') },
                      { id: 'fadeRise', label: t('inspector.text.effect.fadeRise') },
                    ].map((eff) => (
                      <button
                        key={eff.id}
                        onClick={() =>
                          onUpdateText({
                            ...activeText,
                            effect: eff.id as TextEffect,
                          })
                        }
                        className={`py-1 px-1.5 rounded text-[10px] transition ${
                          activeText.effect === eff.id
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 font-bold'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
                        }`}
                      >
                        {eff.label}
                      </button>
                    ))}
                  </div>

                  {/* Font Size & Color */}
                  <div className="flex items-center gap-3 pt-2">
                    <div className="flex-1">
                      <span className="text-[10px] text-neutral-400 block mb-1">
                        {t('inspector.text.fontSize')} {activeText.fontSize}px
                      </span>
                      <input
                        type="range"
                        min="16"
                        max="72"
                        value={activeText.fontSize}
                        onChange={(e) =>
                          onUpdateText({
                            ...activeText,
                            fontSize: Number(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Cor:</span>
                      <input
                        type="color"
                        value={activeText.color || '#ffffff'}
                        onChange={(e) => onUpdateText({ ...activeText, color: e.target.value })}
                        className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. STICK FIGURE OR GROUP SELECTED */}
            {(activeStick || activeGroup) && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      <User size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">
                        {activeStick ? t('inspector.stick.title') : t('inspector.group.title')}
                      </h4>
                      <p className="text-[10px] text-neutral-400">
                        {activeStick
                          ? t('inspector.stick.subtitle')
                          : t('inspector.group.subtitle')}
                      </p>
                    </div>
                  </div>

                  {/* Explicit Delete Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        if (onDeleteStickFigure && activeStick) {
                          onDeleteStickFigure(activeStick.id, false);
                        } else if (activeStick) {
                          const updatedSticks = currentFrameData.stickFigures.filter(
                            (s) => s.id !== activeStick.id
                          );
                          onUpdateFrameData(currentFrame, {
                            ...currentFrameData,
                            stickFigures: updatedSticks,
                          });
                        }
                        onSelectObject(null);
                      }}
                      title={t('inspector.stick.deleteHere')}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-semibold transition"
                    >
                      <Trash2 size={11} />
                      <span>{t('inspector.delete')}</span>
                    </button>
                    {activeStick && onDeleteStickFigure && (
                      <button
                        onClick={() => {
                          onDeleteStickFigure(activeStick.id, true);
                          onSelectObject(null);
                        }}
                        title={t('inspector.stick.deleteAll')}
                        className="flex items-center gap-1 px-1.5 py-1 rounded bg-neutral-900 hover:bg-rose-950/60 text-neutral-400 hover:text-rose-300 border border-neutral-800 text-[9px] transition"
                      >
                        <span>{t('inspector.stick.clearAll')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Grouping / Ungrouping Actions (Flash Flashback!) */}
                <div className="space-y-2 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800">
                  <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                    {t('inspector.grouping')}
                  </span>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={onGroupSelected}
                      title={t('inspector.groupHint')}
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition"
                    >
                      <Group size={13} className="text-sky-400" />
                      {t('selection.groupShort')}
                    </button>

                    <button
                      onClick={onUngroupSelected}
                      title={t('selection.ungroup')}
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-medium transition"
                    >
                      <Ungroup size={13} />
                      {t('selection.ungroupShort')}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-400 leading-tight">
                    {t('inspector.ungroupHelp')}
                  </p>
                </div>

                {/* Pose Library for Stick Figures */}
                {activeStick && (
                  <StickAnimationPanel
                    stickId={activeStick.id}
                    frames={frames}
                    currentFrame={currentFrame}
                    totalFrames={totalFrames}
                    onCopyToFrame={onCopyStickToFrame}
                    onTween={onTweenStick}
                  />
                )}

                {activeStick && (
                  <div className="space-y-2 pt-2 border-t border-neutral-800">
                    <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">
                      {t('inspector.stick.poses')}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {Object.entries(STICK_POSE_PRESETS).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => {
                            const updated = { ...applyPoseToStickFigure(activeStick, key as any), tweened: false };
                            const updatedSticks = currentFrameData.stickFigures.map((s) =>
                              s.id === activeStick.id ? updated : s
                            );
                            onUpdateFrameData(currentFrame, {
                              ...currentFrameData,
                              stickFigures: updatedSticks,
                            });
                          }}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-left transition"
                        >
                          <Zap size={11} className="text-amber-400 shrink-0" />
                          <span className="truncate">{preset.name}</span>
                        </button>
                      ))}
                    </div>

                    {/* Scale & Color */}
                    <div className="space-y-2 pt-2 border-t border-neutral-800">
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1">
                          {t('inspector.stick.scale')} {activeStick.scale.toFixed(2)}x
                        </span>
                        <input
                          type="range"
                          min="0.5"
                          max="2.5"
                          step="0.05"
                          value={activeStick.scale}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const updatedSticks = currentFrameData.stickFigures.map((s) =>
                              s.id === activeStick.id ? { ...s, scale: val } : s
                            );
                            onUpdateFrameData(currentFrame, {
                              ...currentFrameData,
                              stickFigures: updatedSticks,
                            });
                          }}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400">{t('inspector.stick.color')}</span>
                        <input
                          type="color"
                          value={activeStick.color}
                          onChange={(e) => {
                            const col = e.target.value;
                            const updatedSticks = currentFrameData.stickFigures.map((s) =>
                              s.id === activeStick.id ? { ...s, color: col } : s
                            );
                            onUpdateFrameData(currentFrame, {
                              ...currentFrameData,
                              stickFigures: updatedSticks,
                            });
                          }}
                          className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. NO OBJECT SELECTED -> DOCUMENT PROPERTIES (FLASH STYLE) */}
            {!activeChart && !activeText && !activeStick && !activeGroup && !activeActor && !activePath && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
                  <div className="p-1.5 rounded bg-sky-500/10 text-sky-400">
                    <Sliders size={15} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-xs">{t('inspector.doc.title')}</h4>
                    <p className="text-[10px] text-neutral-400">{t('inspector.doc.subtitle')}</p>
                  </div>
                </div>

                {/* Stage Canvas Dimensions & Presets (YouTube, Shorts, etc.) */}
                <div className="space-y-3 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                      {t('inspector.doc.size')}
                    </span>
                    <span className="text-[9px] font-mono text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/60">
                      {canvasDimensions.width} × {canvasDimensions.height} px
                    </span>
                  </div>

                  {/* YouTube & Social Presets */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-neutral-400 font-medium">{t('inspector.doc.presets')}</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() =>
                          onUpdateCanvasDimensions({
                            width: 1920,
                            height: 1080,
                            preset: 'youtube-1080p',
                          })
                        }
                        className={`px-2 py-1.5 rounded text-left text-xs font-semibold border transition ${
                          canvasDimensions.preset === 'youtube-1080p'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                            : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <span className="block text-[11px]">{t('inspector.doc.preset.1080p')}</span>
                        <span className="text-[9px] text-neutral-400 font-mono">1920 × 1080 (16:9)</span>
                      </button>

                      <button
                        onClick={() =>
                          onUpdateCanvasDimensions({
                            width: 1280,
                            height: 720,
                            preset: 'youtube-720p',
                          })
                        }
                        className={`px-2 py-1.5 rounded text-left text-xs font-semibold border transition ${
                          canvasDimensions.preset === 'youtube-720p'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                            : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <span className="block text-[11px]">{t('inspector.doc.preset.720p')}</span>
                        <span className="text-[9px] text-neutral-400 font-mono">1280 × 720 (16:9)</span>
                      </button>

                      <button
                        onClick={() =>
                          onUpdateCanvasDimensions({
                            width: 1080,
                            height: 1920,
                            preset: 'youtube-shorts',
                          })
                        }
                        className={`px-2 py-1.5 rounded text-left text-xs font-semibold border transition ${
                          canvasDimensions.preset === 'youtube-shorts'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                            : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <span className="block text-[11px]">{t('inspector.doc.preset.shorts')}</span>
                        <span className="text-[9px] text-neutral-400 font-mono">1080 × 1920 (9:16)</span>
                      </button>

                      <button
                        onClick={() =>
                          onUpdateCanvasDimensions({
                            width: 1080,
                            height: 1080,
                            preset: 'square',
                          })
                        }
                        className={`px-2 py-1.5 rounded text-left text-xs font-semibold border transition ${
                          canvasDimensions.preset === 'square'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                            : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <span className="block text-[11px]">{t('inspector.doc.preset.square')}</span>
                        <span className="text-[9px] text-neutral-400 font-mono">1080 × 1080 (1:1)</span>
                      </button>
                    </div>
                  </div>

                  {/* Manual Editable Width and Height */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">{t('inspector.doc.width')}</span>
                      <input
                        type="number"
                        min="320"
                        max="3840"
                        step="10"
                        value={canvasDimensions.width}
                        onChange={(e) => {
                          const w = Math.max(320, Math.min(3840, Number(e.target.value) || 1280));
                          onUpdateCanvasDimensions({
                            ...canvasDimensions,
                            width: w,
                            preset: 'custom',
                          });
                        }}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">{t('inspector.doc.height')}</span>
                      <input
                        type="number"
                        min="240"
                        max="2160"
                        step="10"
                        value={canvasDimensions.height}
                        onChange={(e) => {
                          const h = Math.max(240, Math.min(2160, Number(e.target.value) || 720));
                          onUpdateCanvasDimensions({
                            ...canvasDimensions,
                            height: h,
                            preset: 'custom',
                          });
                        }}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Timeline Height / Space Controls */}
                <div className="space-y-2 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                      {t('inspector.doc.timelineSize')}
                    </span>
                    <span className="text-[9px] font-mono text-cyan-400">
                      {timelineHeight}px
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setTimelineHeight(140)}
                      className={`py-1 rounded text-center text-xs font-medium border transition ${
                        timelineHeight === 140
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                      }`}
                    >
                      {t('inspector.doc.timeline.compact')}
                    </button>
                    <button
                      onClick={() => setTimelineHeight(200)}
                      className={`py-1 rounded text-center text-xs font-medium border transition ${
                        timelineHeight === 200
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                      }`}
                    >
                      {t('inspector.doc.timeline.default')}
                    </button>
                    <button
                      onClick={() => setTimelineHeight(320)}
                      className={`py-1 rounded text-center text-xs font-medium border transition ${
                        timelineHeight === 320
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                      }`}
                    >
                      {t('inspector.doc.timeline.wide')}
                    </button>
                  </div>

                  <input
                    type="range"
                    min="110"
                    max="450"
                    value={timelineHeight}
                    onChange={(e) => setTimelineHeight(Number(e.target.value))}
                    className="w-full accent-cyan-500 mt-1"
                  />
                </div>

                {/* Stage Background Color */}
                <div className="space-y-2">
                  <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                    {t('inspector.doc.bgColor')}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={videoBg.color || '#09090b'}
                      onChange={(e) =>
                        setVideoBg((prev) => ({
                          ...prev,
                          color: e.target.value,
                          type: 'color',
                        }))
                      }
                      className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <div className="flex gap-1">
                      {['#09090b', '#0f172a', '#18181b', '#042f2e', '#1e1b4b'].map((c) => (
                        <button
                          key={c}
                          onClick={() =>
                            setVideoBg((prev) => ({ ...prev, color: c, type: 'color' }))
                          }
                          style={{ backgroundColor: c }}
                          className="w-6 h-6 rounded border border-neutral-700 hover:scale-110 transition"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Background Video (the footage the overlays enrich) */}
                <div className="space-y-2">
                  <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                    {t('inspector.doc.video')}
                  </span>
                  <label className="flex items-center gap-2 p-2 rounded border border-dashed border-neutral-700 hover:border-purple-500 bg-neutral-900 cursor-pointer transition text-xs text-neutral-300">
                    <Upload size={14} className="text-purple-400" />
                    <span>
                      {videoBg.type === 'upload' ? t('inspector.doc.replaceVideo') : t('inspector.doc.loadVideo')}
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUploadVideo(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {videoBg.type !== 'color' && videoBg.url && (
                    <>
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span>{t('inspector.doc.videoOpacity')}</span>
                        <span className="font-mono text-neutral-200">
                          {Math.round(videoBg.opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={videoBg.opacity}
                        onChange={(e) =>
                          setVideoBg((prev) => ({ ...prev, opacity: Number(e.target.value) }))
                        }
                        className="w-full accent-purple-500"
                      />
                      <button
                        onClick={() => setVideoBg((prev) => ({ ...prev, type: 'color', url: '' }))}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white text-xs transition"
                      >
                        <VideoOff size={13} />
                        {t('inspector.doc.removeVideo')}
                      </button>
                    </>
                  )}
                </div>

                {/* Quick Add Elements onto Stage */}
                <div className="space-y-2 pt-2 border-t border-neutral-800">
                  <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                    {t('inspector.doc.insert')}
                  </span>
                  <button
                    onClick={onOpenRouteDialog}
                    className="w-full flex items-center gap-2 p-2 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/40 text-left transition"
                  >
                    <Globe2 size={14} />
                    <span className="text-xs">
                      {t('route.title')}
                      <span className="block text-[10px] text-sky-200/60">{t('inspector.doc.routeHint')}</span>
                    </span>
                  </button>
                  <label className="flex items-center gap-2 p-2 rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/40 cursor-pointer transition">
                    <ImageIcon size={14} />
                    <span className="text-xs">
                      {t('inspector.doc.importImage')}
                      <span className="block text-[10px] text-orange-200/60">
                        {t('inspector.doc.importHint')}
                      </span>
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) onImportImageFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => onAddChart('bar')}
                      className="flex items-center gap-1.5 p-2 rounded bg-neutral-900 hover:bg-neutral-800 text-sky-300 border border-neutral-800 text-left transition"
                    >
                      <BarChart3 size={14} className="text-sky-400" />
                      <span>{t('timeline.addChart')}</span>
                    </button>
                    <button
                      onClick={() => onAddText(false)}
                      className="flex items-center gap-1.5 p-2 rounded bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border border-neutral-800 text-left transition"
                    >
                      <Type size={14} className="text-emerald-400" />
                      <span>{t('timeline.addText')}</span>
                    </button>
                    <button
                      onClick={() => onAddText(true)}
                      className="flex items-center gap-1.5 p-2 rounded bg-neutral-900 hover:bg-neutral-800 text-indigo-300 border border-neutral-800 text-left transition"
                    >
                      <Hash size={14} className="text-indigo-400" />
                      <span>{t('inspector.doc.addCounter')}</span>
                    </button>
                    <button
                      onClick={onAddStickFigure}
                      className="flex items-center gap-1.5 p-2 rounded bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-neutral-800 text-left transition"
                    >
                      <User size={14} className="text-amber-400" />
                      <span>{t('inspector.doc.addStick')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= TAB 2: LIBRARY (BIBLIOTECA DE SÍMBOLOS) ================= */}
        {activeTab === 'library' && (
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-white text-xs">{t('inspector.library.title')}</h4>
              <p className="text-[10px] text-neutral-400">
                {t('inspector.library.subtitle')}
              </p>
            </div>

            {/* Stick Figures Section */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                {t('inspector.library.characters')}
              </span>
              <div className="space-y-1">
                <button
                  onClick={onAddStickFigure}
                  className="w-full flex items-center justify-between p-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-amber-400" />
                    <span className="text-neutral-200">{t('inspector.library.presenter')}</span>
                  </div>
                  <Plus size={13} className="text-neutral-400" />
                </button>
              </div>
            </div>

            {/* Charts Section */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                {t('inspector.library.charts')}
              </span>
              <div className="space-y-1">
                <button
                  onClick={() => onAddChart('bar')}
                  className="w-full flex items-center justify-between p-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 size={14} className="text-sky-400" />
                    <span className="text-neutral-200">{t('inspector.library.barChart')}</span>
                  </div>
                  <Plus size={13} className="text-neutral-400" />
                </button>

                <button
                  onClick={() => onAddChart('donut')}
                  className="w-full flex items-center justify-between p-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <PieChart size={14} className="text-emerald-400" />
                    <span className="text-neutral-200">{t('inspector.library.donutChart')}</span>
                  </div>
                  <Plus size={13} className="text-neutral-400" />
                </button>

                <button
                  onClick={() => onAddChart('line')}
                  className="w-full flex items-center justify-between p-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-indigo-400" />
                    <span className="text-neutral-200">{t('inspector.library.lineChart')}</span>
                  </div>
                  <Plus size={13} className="text-neutral-400" />
                </button>
              </div>
            </div>

            {/* Kinetic Text & Tickers */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-neutral-300 uppercase tracking-wider block">
                {t('inspector.library.texts')}
              </span>
              <div className="space-y-1">
                <button
                  onClick={() => onAddText(false)}
                  className="w-full flex items-center justify-between p-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <Type size={14} className="text-fuchsia-400" />
                    <span className="text-neutral-200">{t('inspector.library.typewriter')}</span>
                  </div>
                  <Plus size={13} className="text-neutral-400" />
                </button>

                <button
                  onClick={() => onAddText(true)}
                  className="w-full flex items-center justify-between p-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <Hash size={14} className="text-teal-400" />
                    <span className="text-neutral-200">{t('inspector.library.counter')}</span>
                  </div>
                  <Plus size={13} className="text-neutral-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: HISTÓRICO (FLASH UNDO / REDO STACK) ================= */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div>
                <h4 className="font-bold text-white text-xs">{t('inspector.history.title')}</h4>
                <p className="text-[10px] text-neutral-400">{t('inspector.history.subtitle')}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  title={t('header.undo')}
                  className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 text-neutral-200 transition"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  title={t('inspector.history.redo')}
                  className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 text-neutral-200 transition"
                >
                  <RotateCcw size={13} className="scale-x-[-1]" />
                </button>
              </div>
            </div>

            {pastSteps.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-xs">
                {t('inspector.history.empty')}
                <br />
                {t('inspector.history.emptyHint')}
              </div>
            ) : (
              <div className="space-y-1">
                {pastSteps.map((step, idx) => (
                  <button
                    key={idx}
                    onClick={() => onJumpToHistory(idx)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-left text-neutral-300 border border-neutral-800/60 hover:border-sky-500/40 transition group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-neutral-500">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="font-medium text-xs text-neutral-200 group-hover:text-sky-300">
                        {step.description || t('inspector.history.change')}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-500 group-hover:text-sky-400">
                      {t('inspector.history.revert')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
