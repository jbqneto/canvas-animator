import React from 'react';
import {
  MousePointer,
  PenTool,
  Minus,
  MoveRight,
  Square,
  Circle,
  Eraser,
  Eye,
  Plus,
  Palette,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import { StickFigure, FrameData } from '../types';
import {
  STICK_POSE_PRESETS,
  applyPoseToStickFigure,
  createDefaultStickFigure,
} from '../utils/stickFigurePresets';

interface StickFigurePanelProps {
  currentFrame: number;
  totalFrames: number;
  frames: Record<number, FrameData>;
  onUpdateFrameData: (frameNum: number, data: FrameData) => void;
  selectedStickId: string | null;
  onSelectStick: (id: string | null) => void;
  activeTool: 'pointer' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'eraser';
  setActiveTool: (tool: 'pointer' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'eraser') => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  strokeThickness: number;
  setStrokeThickness: (thickness: number) => void;
  onionSkinEnabled: boolean;
  setOnionSkinEnabled: (val: boolean | ((prev: boolean) => boolean)) => void;
  onGenerateWalkCycle: () => void;
  onGeneratePresenterScene: () => void;
}

export const StickFigurePanel: React.FC<StickFigurePanelProps> = ({
  currentFrame,
  frames,
  onUpdateFrameData,
  selectedStickId,
  onSelectStick,
  activeTool,
  setActiveTool,
  strokeColor,
  setStrokeColor,
  strokeThickness,
  setStrokeThickness,
  onionSkinEnabled,
  setOnionSkinEnabled,
  onGenerateWalkCycle,
  onGeneratePresenterScene,
}) => {
  const currentFrameData: FrameData = frames[currentFrame] || {
    frameNumber: currentFrame,
    stickFigures: [],
    drawings: [],
  };

  const selectedStick = currentFrameData.stickFigures.find(
    (s) => s.id === selectedStickId
  );

  // Add new stick figure
  const handleAddStickFigure = () => {
    const newId = `stick-${Date.now()}`;
    const newStick = createDefaultStickFigure(
      newId,
      `Palito ${currentFrameData.stickFigures.length + 1}`,
      350 + (currentFrameData.stickFigures.length * 60) % 300,
      320
    );
    onUpdateFrameData(currentFrame, {
      ...currentFrameData,
      stickFigures: [...currentFrameData.stickFigures, newStick],
    });
    onSelectStick(newId);
  };

  // Apply Pose to selected stick
  const handleApplyPose = (poseKey: string) => {
    if (!selectedStick) return;
    const updated = applyPoseToStickFigure(selectedStick, poseKey);
    const updatedSticks = currentFrameData.stickFigures.map((s) =>
      s.id === selectedStick.id ? updated : s
    );
    onUpdateFrameData(currentFrame, {
      ...currentFrameData,
      stickFigures: updatedSticks,
    });
  };

  // Change stick color
  const handleColorChange = (c: string) => {
    if (selectedStick) {
      const updated = { ...selectedStick, color: c };
      onUpdateFrameData(currentFrame, {
        ...currentFrameData,
        stickFigures: currentFrameData.stickFigures.map((s) =>
          s.id === selectedStick.id ? updated : s
        ),
      });
    }
    setStrokeColor(c);
  };

  // Change stick thickness
  const handleThicknessChange = (val: number) => {
    if (selectedStick) {
      const updated = { ...selectedStick, thickness: val };
      onUpdateFrameData(currentFrame, {
        ...currentFrameData,
        stickFigures: currentFrameData.stickFigures.map((s) =>
          s.id === selectedStick.id ? updated : s
        ),
      });
    }
    setStrokeThickness(val);
  };

  const PALETTE = [
    '#38bdf8', // Sky Blue
    '#22c55e', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#a855f7', // Purple
    '#ec4899', // Pink
    '#ffffff', // White
    '#000000', // Classic Ink Black
  ];

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-r border-neutral-800 text-neutral-200 w-80 shrink-0 select-none overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 border-b border-neutral-800 bg-neutral-950/70 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Zap size={16} className="text-sky-400" />
            Estúdio Flash & Bonecos
          </h2>
          <p className="text-[11px] text-neutral-400">
            Ferramentas 2D, Rigging e Pose
          </p>
        </div>

        {/* Onion Skin toggle button */}
        <button
          onClick={() => setOnionSkinEnabled((v) => !v)}
          title="Onion Skinning: Veja o frame anterior como fantasma ciano"
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium transition ${
            onionSkinEnabled
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/10'
              : 'bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700'
          }`}
        >
          <Eye size={12} />
          Onion Skin
        </button>
      </div>

      <div className="p-3.5 space-y-5">
        {/* Flash Toolbox */}
        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 block mb-2">
            Ferramentas de Desenho
          </label>
          <div className="grid grid-cols-4 gap-1.5 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
            <button
              id="tool-pointer-btn"
              onClick={() => setActiveTool('pointer')}
              title="Mover & Articular Juntas do Palito"
              className={`p-2 rounded flex flex-col items-center justify-center gap-1 transition ${
                activeTool === 'pointer'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-850'
              }`}
            >
              <MousePointer size={16} />
              <span className="text-[10px]">Articular</span>
            </button>

            <button
              id="tool-pen-btn"
              onClick={() => setActiveTool('pen')}
              title="Pincel / Caneta Livre"
              className={`p-2 rounded flex flex-col items-center justify-center gap-1 transition ${
                activeTool === 'pen'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-850'
              }`}
            >
              <PenTool size={16} />
              <span className="text-[10px]">Pincel</span>
            </button>

            <button
              id="tool-arrow-btn"
              onClick={() => setActiveTool('arrow')}
              title="Seta Indicativa"
              className={`p-2 rounded flex flex-col items-center justify-center gap-1 transition ${
                activeTool === 'arrow'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-850'
              }`}
            >
              <MoveRight size={16} />
              <span className="text-[10px]">Seta</span>
            </button>

            <button
              id="tool-line-btn"
              onClick={() => setActiveTool('line')}
              title="Linha Reta"
              className={`p-2 rounded flex flex-col items-center justify-center gap-1 transition ${
                activeTool === 'line'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-850'
              }`}
            >
              <Minus size={16} />
              <span className="text-[10px]">Linha</span>
            </button>

            <button
              id="tool-rect-btn"
              onClick={() => setActiveTool('rect')}
              title="Retângulo"
              className={`p-2 rounded flex flex-col items-center justify-center gap-1 transition ${
                activeTool === 'rect'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-850'
              }`}
            >
              <Square size={16} />
              <span className="text-[10px]">Caixa</span>
            </button>

            <button
              id="tool-circle-btn"
              onClick={() => setActiveTool('circle')}
              title="Círculo"
              className={`p-2 rounded flex flex-col items-center justify-center gap-1 transition ${
                activeTool === 'circle'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-850'
              }`}
            >
              <Circle size={16} />
              <span className="text-[10px]">Círculo</span>
            </button>

            <button
              id="tool-eraser-btn"
              onClick={() => setActiveTool('eraser')}
              title="Borracha de traços"
              className={`p-2 rounded flex flex-col items-center justify-center gap-1 transition ${
                activeTool === 'eraser'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-850'
              }`}
            >
              <Eraser size={16} />
              <span className="text-[10px]">Borracha</span>
            </button>

            {/* Quick Add Stick */}
            <button
              id="add-stick-btn"
              onClick={handleAddStickFigure}
              title="Adicionar Boneco Palito no Frame"
              className="p-2 rounded flex flex-col items-center justify-center gap-1 bg-neutral-800 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition"
            >
              <Plus size={16} />
              <span className="text-[10px]">+ Palito</span>
            </button>
          </div>
        </div>

        {/* Colors & Thickness */}
        <div className="space-y-3 bg-neutral-950/60 p-3 rounded-lg border border-neutral-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <Palette size={13} /> Cor
            </span>
            <div className="flex items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorChange(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border transition ${
                    strokeColor === c
                      ? 'border-white scale-110 shadow-md ring-2 ring-sky-500/40'
                      : 'border-neutral-700 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
              <span className="flex items-center gap-1">
                <Sliders size={13} /> Espessura
              </span>
              <span className="font-mono text-neutral-200">{strokeThickness}px</span>
            </div>
            <input
              type="range"
              min="2"
              max="16"
              value={strokeThickness}
              onChange={(e) => handleThicknessChange(Number(e.target.value))}
              className="w-full accent-sky-500 bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* Selected Stick Figure & Pose Presets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Biblioteca de Poses
            </label>
            {selectedStick ? (
              <span className="text-[11px] text-sky-400 font-mono bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30">
                {selectedStick.name}
              </span>
            ) : (
              <span className="text-[10px] text-neutral-500 italic">
                (Clique num palito)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(STICK_POSE_PRESETS).map(([key, pose]) => (
              <button
                key={key}
                onClick={() => handleApplyPose(key)}
                disabled={!selectedStick}
                className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                  selectedStick
                    ? 'bg-neutral-950/80 hover:bg-neutral-800 border-neutral-800 hover:border-sky-500/50 text-neutral-200'
                    : 'bg-neutral-950/30 border-neutral-900 text-neutral-600 cursor-not-allowed'
                }`}
              >
                <div className="font-semibold text-xs text-white">
                  {pose.name}
                </div>
                <div className="text-[10px] text-neutral-400 mt-1 line-clamp-1">
                  {pose.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 1-Click Animation Generators */}
        <div className="bg-gradient-to-b from-sky-950/30 to-neutral-950 p-3 rounded-lg border border-sky-500/20 space-y-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-sky-400 flex items-center gap-1">
            <Sparkles size={13} />
            Geradores Rápidos de Cena
          </span>

          <button
            onClick={onGeneratePresenterScene}
            className="w-full py-2 px-3 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-semibold border border-sky-500/40 text-left transition flex items-center justify-between"
          >
            <span>Apresentador & Gráficos</span>
            <span className="text-[10px] font-mono text-sky-400">Auto</span>
          </button>

          <button
            onClick={onGenerateWalkCycle}
            className="w-full py-2 px-3 rounded bg-neutral-800 hover:bg-neutral-750 text-neutral-300 text-xs font-medium border border-neutral-700 text-left transition flex items-center justify-between"
          >
            <span>Ciclo de Caminhada (24 frames)</span>
            <span className="text-[10px] font-mono text-neutral-400">Passos</span>
          </button>
        </div>
      </div>
    </div>
  );
};
