import React, { useState } from 'react';
import {
  BarChart3,
  Type,
  Video,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
  Upload,
  PlaySquare,
  TrendingUp,
  PieChart,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  ChartOverlay,
  ChartDataPoint,
  TextOverlay,
  VideoBackground,
  ChartType,
  TextEffect,
} from '../types';

interface OverlaysPanelProps {
  charts: ChartOverlay[];
  setCharts: React.Dispatch<React.SetStateAction<ChartOverlay[]>>;
  texts: TextOverlay[];
  setTexts: React.Dispatch<React.SetStateAction<TextOverlay[]>>;
  videoBg: VideoBackground;
  setVideoBg: React.Dispatch<React.SetStateAction<VideoBackground>>;
  currentFrame: number;
  totalFrames: number;
  onUploadVideo: (file: File) => void;
}

export const OverlaysPanel: React.FC<OverlaysPanelProps> = ({
  charts,
  setCharts,
  texts,
  setTexts,
  videoBg,
  setVideoBg,
  currentFrame,
  totalFrames,
  onUploadVideo,
}) => {
  const [activeTab, setActiveTab] = useState<'charts' | 'texts' | 'video'>('charts');

  // New Chart Form state
  const [newChartType, setNewChartType] = useState<ChartType>('bar');
  const [newChartTitle, setNewChartTitle] = useState('Desempenho Educativo');

  // New Text Form state
  const [newText, setNewText] = useState('Animações Incríveis');
  const [newSubtitle, setNewSubtitle] = useState('Criadas em tempo real com React & Canvas');
  const [newTextEffect, setNewTextEffect] = useState<TextEffect>('typewriter');
  const [newBadge, setNewBadge] = useState('Lição 01');

  // Preset sample videos (royalty-free webm/mp4 links or dynamic canvas fallback)
  const PRESET_VIDEOS = [
    {
      id: 'mesh',
      name: 'Cyber Grid & Partículas',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    },
    {
      id: 'nature',
      name: 'Modern Tech Flow',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    },
  ];

  // Add Chart
  const handleAddChart = () => {
    const id = `chart-${Date.now()}`;
    let sampleData: ChartDataPoint[] = [
      { label: 'Jan', value: 35, color: '#38bdf8' },
      { label: 'Fev', value: 65, color: '#0ea5e9' },
      { label: 'Mar', value: 92, color: '#0284c7' },
      { label: 'Abr', value: 120, color: '#22c55e' },
    ];

    if (newChartType === 'donut') {
      sampleData = [
        { label: 'Concluído', value: 78, color: '#38bdf8' },
        { label: 'Pendente', value: 22, color: '#334155' },
      ];
    } else if (newChartType === 'line') {
      sampleData = [
        { label: 'Sem 1', value: 20, color: '#38bdf8' },
        { label: 'Sem 2', value: 45, color: '#0ea5e9' },
        { label: 'Sem 3', value: 80, color: '#6366f1' },
        { label: 'Sem 4', value: 110, color: '#a855f7' },
      ];
    }

    const newChart: ChartOverlay = {
      id,
      title: newChartTitle,
      type: newChartType,
      x: 48, // Place on right side of canvas (allowing stick figure on left!)
      y: 18,
      width: 440,
      height: 280,
      startFrame: Math.max(1, currentFrame),
      durationFrames: Math.min(totalFrames, 48),
      data: sampleData,
      statMetric: {
        value: '142',
        suffix: '%',
        label: 'Crescimento de Retenção',
      },
      animationType: 'grow',
      visible: true,
    };

    setCharts((prev) => [...prev, newChart]);
  };

  // Add Kinetic Text
  const handleAddText = () => {
    const id = `text-${Date.now()}`;
    const newOverlay: TextOverlay = {
      id,
      text: newText,
      subtitle: newSubtitle,
      x: 8,
      y: 15,
      fontSize: 34,
      color: '#ffffff',
      effect: newTextEffect,
      startFrame: Math.max(1, currentFrame),
      durationFrames: Math.min(totalFrames, 48),
      badge: newBadge,
      visible: true,
    };
    setTexts((prev) => [...prev, newOverlay]);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-l border-neutral-800 text-neutral-200 w-80 shrink-0 select-none overflow-y-auto">
      {/* Tab Switcher */}
      <div className="h-11 border-b border-neutral-800 bg-neutral-950 flex">
        <button
          onClick={() => setActiveTab('charts')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold transition border-b-2 ${
            activeTab === 'charts'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <BarChart3 size={14} />
          Gráficos
        </button>

        <button
          onClick={() => setActiveTab('texts')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold transition border-b-2 ${
            activeTab === 'texts'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <Type size={14} />
          Textos
        </button>

        <button
          onClick={() => setActiveTab('video')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold transition border-b-2 ${
            activeTab === 'video'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <Video size={14} />
          Vídeo
        </button>
      </div>

      {/* Tab 1: Charts Panel */}
      {activeTab === 'charts' && (
        <div className="p-3.5 space-y-4">
          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-3">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
              Adicionar Gráfico Animado
            </span>

            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">
                Tipo de Gráfico
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'bar', label: 'Barras', icon: BarChart3 },
                  { id: 'donut', label: 'Progresso', icon: PieChart },
                  { id: 'line', label: 'Linha/Tendência', icon: TrendingUp },
                  { id: 'stat', label: 'Métrica/Número', icon: Sparkles },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setNewChartType(item.id as ChartType)}
                    className={`py-1.5 px-2 rounded text-xs flex items-center gap-1.5 border transition ${
                      newChartType === item.id
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-semibold'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <item.icon size={13} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">
                Título do Gráfico
              </label>
              <input
                type="text"
                value={newChartTitle}
                onChange={(e) => setNewChartTitle(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-500 outline-none"
              />
            </div>

            <button
              onClick={handleAddChart}
              className="w-full py-2 px-3 rounded-md bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/15 transition"
            >
              <Plus size={14} />
              Inserir Gráfico no Frame {currentFrame}
            </button>
          </div>

          {/* Active Charts List */}
          <div>
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Gráficos Ativos ({charts.length})
            </span>

            {charts.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-neutral-800 text-center text-xs text-neutral-500">
                Nenhum gráfico inserido ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {charts.map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                  >
                    <div className="overflow-hidden">
                      <div className="font-semibold text-xs text-white truncate flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        {c.title}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                        Frames {c.startFrame} a {c.startFrame + c.durationFrames} ({c.type})
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setCharts((prev) =>
                            prev.map((item) =>
                              item.id === c.id
                                ? { ...item, visible: !item.visible }
                                : item
                            )
                          )
                        }
                        className="p-1 rounded text-neutral-400 hover:text-white"
                        title={c.visible ? 'Ocultar' : 'Exibir'}
                      >
                        {c.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>

                      <button
                        onClick={() =>
                          setCharts((prev) => prev.filter((item) => item.id !== c.id))
                        }
                        className="p-1 rounded text-neutral-400 hover:text-rose-400"
                        title="Remover Gráfico"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Kinetic Texts Panel */}
      {activeTab === 'texts' && (
        <div className="p-3.5 space-y-4">
          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-3">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              Adicionar Texto Cinético
            </span>

            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">
                Texto Principal
              </label>
              <input
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">
                Subtítulo / Descrição
              </label>
              <input
                type="text"
                value={newSubtitle}
                onChange={(e) => setNewSubtitle(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-400 block mb-1">
                  Tag / Badge
                </label>
                <input
                  type="text"
                  value={newBadge}
                  onChange={(e) => setNewBadge(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-neutral-400 block mb-1">
                  Efeito de Entrada
                </label>
                <select
                  value={newTextEffect}
                  onChange={(e) => setNewTextEffect(e.target.value as TextEffect)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                >
                  <option value="typewriter">Máquina de Escrever</option>
                  <option value="bouncePop">Pop Elástico</option>
                  <option value="slideLeft">Deslizar da Esquerda</option>
                  <option value="fadeRise">Surgir & Subir</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleAddText}
              className="w-full py-2 px-3 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/15 transition"
            >
              <Plus size={14} />
              Inserir Texto no Frame {currentFrame}
            </button>
          </div>

          {/* Active Texts List */}
          <div>
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Textos Ativos ({texts.length})
            </span>

            {texts.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-neutral-800 text-center text-xs text-neutral-500">
                Nenhum texto inserido ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {texts.map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                  >
                    <div className="overflow-hidden">
                      <div className="font-semibold text-xs text-white truncate flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        {t.text}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                        Frames {t.startFrame} a {t.startFrame + t.durationFrames} ({t.effect})
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setTexts((prev) =>
                            prev.map((item) =>
                              item.id === t.id
                                ? { ...item, visible: !item.visible }
                                : item
                            )
                          )
                        }
                        className="p-1 rounded text-neutral-400 hover:text-white"
                        title={t.visible ? 'Ocultar' : 'Exibir'}
                      >
                        {t.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>

                      <button
                        onClick={() =>
                          setTexts((prev) => prev.filter((item) => item.id !== t.id))
                        }
                        className="p-1 rounded text-neutral-400 hover:text-rose-400"
                        title="Remover Texto"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Video Background Panel */}
      {activeTab === 'video' && (
        <div className="p-3.5 space-y-4">
          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-3">
            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
              Fundo & Vídeo de Base
            </span>

            {/* Custom Video Upload */}
            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">
                Importar Vídeo do seu Computador
              </label>
              <label className="flex flex-col items-center justify-center p-3 rounded border border-dashed border-neutral-700 hover:border-purple-500 bg-neutral-900 cursor-pointer transition">
                <Upload size={18} className="text-purple-400 mb-1" />
                <span className="text-xs text-neutral-300 font-medium">
                  Clique para carregar vídeo (MP4/WebM)
                </span>
                <span className="text-[10px] text-neutral-500">
                  Ideal para aulas, apresentações e reacts
                </span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      onUploadVideo(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {/* Background Presets */}
            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">
                Ou escolha um Vídeo de Exemplo
              </label>
              <div className="space-y-1.5">
                {PRESET_VIDEOS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() =>
                      setVideoBg({
                        type: 'preset',
                        url: v.url,
                        opacity: 0.85,
                        playbackRate: 1,
                      })
                    }
                    className={`w-full p-2 rounded border text-left text-xs transition flex items-center justify-between ${
                      videoBg.url === v.url
                        ? 'bg-purple-500/20 border-purple-500/60 text-purple-300 font-semibold'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-850'
                    }`}
                  >
                    <span>{v.name}</span>
                    <PlaySquare size={14} className="text-neutral-500" />
                  </button>
                ))}
              </div>
            </div>

            {/* Solid Color Mode */}
            <button
              onClick={() =>
                setVideoBg({
                  type: 'color',
                  color: '#09090b',
                  opacity: 1,
                  playbackRate: 1,
                })
              }
              className="w-full py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white text-xs transition"
            >
              Fundo Escuro Neutro (Sem Vídeo)
            </button>

            {/* Video Opacity Slider */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                <span>Opacidade do Fundo</span>
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
                  setVideoBg((prev) => ({
                    ...prev,
                    opacity: Number(e.target.value),
                  }))
                }
                className="w-full accent-purple-500 bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
