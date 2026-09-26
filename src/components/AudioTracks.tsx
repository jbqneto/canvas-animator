/**
 * Audio rows of the timeline: the list on the left (name, mute, volume) and the clips with their
 * waveform on the right (drag to move, edges to trim).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, Headphones, Music, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';
import type { AudioClip, HistorySnapshot } from '../types';
import { useI18n } from '../i18n';
import { clipDurationFrames, clipWaveform, moveClip, trimClipEnd, trimClipStart } from '../engine/audio';
import { decodeClip } from '../audio/audioRuntime';

export const AUDIO_HEADER_HEIGHT = 'h-7';
export const AUDIO_ROW_HEIGHT = 'h-10';

const formatSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

interface AudioListProps {
  clips: AudioClip[];
  onImport: (files: FileList) => void;
  onUpdate: (clip: AudioClip, description?: string) => void;
  onTransientUpdate: (clip: AudioClip) => void;
  onCommit: (clip: AudioClip, description: string, baseSnapshot: HistorySnapshot) => void;
  onDelete: (clipId: string) => void;
  getCurrentSnapshot?: () => HistorySnapshot;
  scrub: boolean;
  setScrub: (on: boolean) => void;
}

/** Left column: section header and one control row per clip. */
export const AudioList: React.FC<AudioListProps> = ({
  clips,
  onImport,
  onUpdate,
  onTransientUpdate,
  onCommit,
  onDelete,
  getCurrentSnapshot,
  scrub,
  setScrub,
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  // Volume slider: live changes while dragging, one undo step when released
  const volumeBase = useRef<HistorySnapshot | null>(null);

  return (
    <div>
      <div
        className={`${AUDIO_HEADER_HEIGHT} px-2.5 bg-neutral-900 border-y border-neutral-800 flex items-center justify-between text-[10px] text-neutral-300 font-semibold`}
      >
        <div className="flex items-center gap-1.5">
          <AudioLines size={13} className="text-violet-400" />
          <span>{t('audio.section', { count: clips.length })}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            id="audio-scrub-toggle"
            onClick={() => setScrub(!scrub)}
            title={t('audio.scrubHint')}
            className={`p-1 rounded border transition ${
              scrub
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                : 'text-neutral-500 border-transparent hover:text-neutral-300'
            }`}
          >
            <Headphones size={11} />
          </button>
          <button
            id="audio-import-btn"
            onClick={() => inputRef.current?.click()}
            title={t('audio.importHint')}
            className="px-1.5 py-0.5 rounded bg-violet-500/15 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 text-[10px] font-medium flex items-center gap-1 transition"
          >
            <Plus size={11} />
            <span>{t('audio.import')}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onImport(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {clips.map((clip) => (
        <div
          key={clip.id}
          className={`${AUDIO_ROW_HEIGHT} px-2.5 border-b border-neutral-900 flex items-center gap-1.5 ${
            clip.muted ? 'opacity-60' : ''
          }`}
        >
          <Music size={12} className="text-violet-400 shrink-0" />
          <span className="text-[11px] text-neutral-200 truncate flex-1" title={clip.name}>
            {clip.name}
          </span>
          <button
            onClick={() => onUpdate({ ...clip, muted: !clip.muted }, t(clip.muted ? 'audio.history.unmute' : 'audio.history.mute', { name: clip.name }))}
            title={clip.muted ? t('audio.unmute') : t('audio.mute')}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white shrink-0"
          >
            {clip.muted ? <VolumeX size={12} className="text-rose-400" /> : <Volume2 size={12} />}
          </button>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={clip.volume}
            title={t('audio.volume', { percent: Math.round(clip.volume * 100) })}
            onPointerDown={() => {
              volumeBase.current = getCurrentSnapshot?.() ?? null;
            }}
            onChange={(e) => onTransientUpdate({ ...clip, volume: Number(e.target.value) })}
            onPointerUp={(e) => {
              const volume = Number((e.target as HTMLInputElement).value);
              if (volumeBase.current) {
                onCommit({ ...clip, volume }, t('audio.history.volume', { name: clip.name }), volumeBase.current);
              }
              volumeBase.current = null;
            }}
            className="w-16 accent-violet-500 shrink-0"
          />
          <button
            onClick={() => onDelete(clip.id)}
            title={t('audio.delete')}
            className="p-1 rounded hover:bg-rose-950/40 text-neutral-500 hover:text-rose-400 shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

/** Waveform of the audible part of a clip, redrawn when the clip or its on-screen width changes. */
const Waveform: React.FC<{ clip: AudioClip }> = ({ clip }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let alive = true;
    decodeClip(clip)
      .then((audio) => alive && setPeaks(audio.peaks))
      .catch(() => alive && setPeaks(null));
    return () => {
      alive = false;
    };
    // Only a new source needs decoding; trims reuse the same peaks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const wave = clipWaveform(peaks, clip, size.w);
    const mid = size.h / 2;
    ctx.fillStyle = 'rgba(196, 181, 253, 0.85)';
    // Gain is shown on the waveform so a boosted/cut clip looks like it sounds
    const gain = clip.muted ? 0.15 : Math.min(1.6, clip.volume);
    wave.forEach((v, x) => {
      const h = Math.max(0.5, Math.min(1, v * gain) * mid);
      ctx.fillRect(x, mid - h, 1, h * 2);
    });
  }, [peaks, size, clip]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};

type AudioDragMode = 'move' | 'trim-start' | 'trim-end';

interface AudioLanesProps {
  clips: AudioClip[];
  totalFrames: number;
  fps: number;
  onTransientUpdate: (clip: AudioClip) => void;
  onCommit: (clip: AudioClip, description: string, baseSnapshot: HistorySnapshot) => void;
  getCurrentSnapshot?: () => HistorySnapshot;
  /** Width of the frame area in pixels, to turn mouse movement into frames. */
  getTrackWidth: () => number;
}

/** Right column: rows aligned with AudioList, each with its clip bar. */
export const AudioLanes: React.FC<AudioLanesProps> = ({
  clips,
  totalFrames,
  fps,
  onTransientUpdate,
  onCommit,
  getCurrentSnapshot,
  getTrackWidth,
}) => {
  const { t } = useI18n();
  const [drag, setDrag] = useState<{
    clip: AudioClip;
    mode: AudioDragMode;
    startX: number;
    trackWidth: number;
    base?: HistorySnapshot;
    last: AudioClip;
  } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const session = drag;
    const apply = (clientX: number) => {
      const delta = Math.round((clientX - session.startX) * (totalFrames / session.trackWidth));
      const c = session.clip;
      if (session.mode === 'move') return moveClip(c, Math.min(totalFrames, c.startFrame + delta));
      if (session.mode === 'trim-start') return trimClipStart(c, delta, fps);
      return trimClipEnd(c, delta, fps);
    };
    const onMove = (e: MouseEvent) => {
      session.last = apply(e.clientX);
      onTransientUpdate(session.last);
    };
    const onUp = () => {
      const c = session.last;
      const changed =
        c.startFrame !== session.clip.startFrame ||
        c.offset !== session.clip.offset ||
        c.duration !== session.clip.duration;
      if (changed && session.base) {
        onCommit(
          c,
          t(session.mode === 'move' ? 'audio.history.move' : 'audio.history.trim', { name: c.name }),
          session.base
        );
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, totalFrames, fps, onTransientUpdate, onCommit, t]);

  const begin = (e: React.MouseEvent, clip: AudioClip, mode: AudioDragMode) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      clip,
      mode,
      startX: e.clientX,
      trackWidth: getTrackWidth() || 800,
      base: getCurrentSnapshot?.(),
      last: clip,
    });
  };

  return (
    <div>
      <div className={`${AUDIO_HEADER_HEIGHT} bg-neutral-900/70 border-y border-neutral-800`} />
      {clips.map((clip) => {
        // Last frame with sound under it
        const endFrame = Math.max(clip.startFrame, Math.ceil(clip.startFrame - 1 + clipDurationFrames(clip, fps)));
        return (
          <div key={clip.id} className={`${AUDIO_ROW_HEIGHT} border-b border-neutral-900 relative overflow-hidden`}>
            <div
              data-audio-clip={clip.id}
              style={{
                left: `${((clip.startFrame - 1) / totalFrames) * 100}%`,
                width: `${(clipDurationFrames(clip, fps) / totalFrames) * 100}%`,
              }}
              onMouseDown={(e) => begin(e, clip, 'move')}
              onClick={(e) => e.stopPropagation()}
              title={t('audio.clipInfo', {
                name: clip.name,
                start: clip.startFrame,
                end: endFrame,
                from: formatSeconds(clip.offset),
                to: formatSeconds(clip.offset + clip.duration),
              })}
              className={`absolute top-1 bottom-1 rounded border cursor-grab active:cursor-grabbing z-10 ${
                clip.muted
                  ? 'bg-neutral-900/80 border-neutral-700'
                  : 'bg-violet-950/70 border-violet-500/60 hover:border-violet-400'
              }`}
            >
              <Waveform clip={clip} />
              <span className="absolute left-2.5 top-0 text-[9px] font-semibold text-violet-100/90 truncate max-w-[60%] pointer-events-none drop-shadow">
                {clip.name}
              </span>
              <div
                onMouseDown={(e) => begin(e, clip, 'trim-start')}
                title={t('timeline.trimStart')}
                className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 rounded-l"
              />
              <div
                onMouseDown={(e) => begin(e, clip, 'trim-end')}
                title={t('timeline.trimEnd')}
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 rounded-r"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
