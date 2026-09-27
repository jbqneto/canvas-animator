import React, { useEffect, useState } from 'react';
import { Sparkles, Image as ImageIcon, Wand2, X, Check, Loader2, KeyRound } from 'lucide-react';
import { useI18n } from '../i18n';
import { ImageOverlay, VideoBackground } from '../types';
import { AiNoImageError, AiSetupError, AiSetupProblem, generateImage } from '../ai/aiClient';
import { useAiKey } from '../ai/useAiKey';

interface AiImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFrame: number;
  totalFrames: number;
  canvasSnapshot: string | null;
  onAddImageOverlay: (img: ImageOverlay) => void;
  onSetAsBackground: (url: string) => void;
  /** Opens the "own AI key" dialog. */
  onOpenAiKey: () => void;
}

export const AiImageModal: React.FC<AiImageModalProps> = ({
  isOpen,
  onClose,
  currentFrame,
  totalFrames,
  canvasSnapshot,
  onAddImageOverlay,
  onSetAsBackground,
  onOpenAiKey,
}) => {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '1:1'>('16:9');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [setupProblem, setSetupProblem] = useState<AiSetupProblem | null>(null);
  const ownKey = useAiKey();
  useEffect(() => setSetupProblem(null), [ownKey]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSetupProblem(null);

    try {
      const imageUrl = await generateImage({
        prompt,
        aspectRatio,
        base64Image: mode === 'edit' && canvasSnapshot ? canvasSnapshot : undefined,
      });
      setGeneratedImage(imageUrl);
    } catch (err: any) {
      if (err instanceof AiSetupError) setSetupProblem(err.problem);
      else if (err instanceof AiNoImageError) setErrorMsg(t('aiImage.errorGenerate') + (err.details ? ` ${err.details}` : ''));
      else setErrorMsg(err.message || t('aiImage.errorFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsertAsProp = () => {
    if (!generatedImage) return;
    const newProp: ImageOverlay = {
      id: `prop-${Date.now()}`,
      url: generatedImage,
      x: 50,
      y: 50,
      width: aspectRatio === '16:9' ? 480 : 300,
      height: aspectRatio === '16:9' ? 270 : 300,
      startFrame: currentFrame,
      durationFrames: Math.min(totalFrames - currentFrame + 1, 48),
      animationType: 'pop',
    };
    onAddImageOverlay(newProp);
    onClose();
  };

  const handleApplyBackground = () => {
    if (!generatedImage) return;
    onSetAsBackground(generatedImage);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden text-neutral-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center border border-fuchsia-500/30">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {t('aiImage.title')}
              </h3>
              <p className="text-[11px] text-neutral-400">
                {t('aiImage.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenAiKey}
              title={t('aiKey.open')}
              className={`p-1 rounded hover:text-white ${ownKey ? 'text-amber-400' : 'text-neutral-400'}`}
              data-open-ai-key
            >
              <KeyRound size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Mode Switcher */}
          <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-800">
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                mode === 'create'
                  ? 'bg-fuchsia-500 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ImageIcon size={14} />
              {t('aiImage.modeCreate')}
            </button>

            <button
              onClick={() => setMode('edit')}
              className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                mode === 'edit'
                  ? 'bg-fuchsia-500 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Wand2 size={14} />
              {t('aiImage.modeEdit')}
            </button>
          </div>

          {/* Aspect Ratio */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">{t('aiImage.ratio')}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setAspectRatio('16:9')}
                className={`px-3 py-1 rounded text-xs border transition ${
                  aspectRatio === '16:9'
                    ? 'bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-300 font-semibold'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                {t('aiImage.ratioWide')}
              </button>
              <button
                onClick={() => setAspectRatio('1:1')}
                className={`px-3 py-1 rounded text-xs border transition ${
                  aspectRatio === '1:1'
                    ? 'bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-300 font-semibold'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                {t('aiImage.ratioSquare')}
              </button>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs text-neutral-300 block mb-1 font-medium">
              {mode === 'create'
                ? t('aiImage.promptCreate')
                : t('aiImage.promptEdit')}
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === 'create'
                  ? t('aiImage.placeholderCreate')
                  : t('aiImage.placeholderEdit')
              }
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:border-fuchsia-500 outline-none resize-none"
            />
          </div>

          {setupProblem && (
            <div className="p-3 rounded bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2" data-ai-setup={setupProblem}>
              <span className="flex-1">{t(`aiKey.problem.${setupProblem}`)}</span>
              <button onClick={onOpenAiKey} className="shrink-0 px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold">
                {t('aiKey.configure')}
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="w-full py-2.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-500/20 transition"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('aiImage.generating')}
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {mode === 'create' ? t('aiImage.generate') : t('aiImage.applyEdit')}
              </>
            )}
          </button>

          {/* Preview of Generated Image */}
          {generatedImage && (
            <div className="pt-2 border-t border-neutral-800 space-y-3">
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <Check size={14} /> {t('aiImage.success')}
              </span>

              <div className="rounded-lg overflow-hidden border border-neutral-700 max-h-52 flex items-center justify-center bg-black">
                <img
                  src={generatedImage}
                  alt={t('aiImage.resultAlt')}
                  referrerPolicy="no-referrer"
                  className="max-h-52 w-auto object-contain"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleInsertAsProp}
                  className="py-2 px-3 rounded bg-neutral-800 hover:bg-neutral-750 text-xs font-semibold text-white border border-neutral-700 transition"
                >
                  {t('aiImage.insert')}
                </button>
                <button
                  onClick={handleApplyBackground}
                  className="py-2 px-3 rounded bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-xs font-semibold text-fuchsia-300 border border-fuchsia-500/40 transition"
                >
                  {t('aiImage.setBackground')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
