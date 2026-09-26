import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Globe2, Loader2, Plane, X } from 'lucide-react';
import type { ActorOverlay } from '../types';
import { Country, loadWorld, MapFraming } from '../map/worldMap';
import { routeTotalFrames } from '../map/routeTemplate';

export interface RouteRequest {
  stops: Country[];
  secondsPerLeg: number;
  pauseSeconds: number;
  framing: MapFraming;
  highlight: boolean;
  labels: boolean;
  /** Curved flight arcs instead of straight legs. */
  arc: boolean;
  /** Actor to use as the vehicle; undefined = built-in plane. */
  vehicleActorId?: string;
}

interface RouteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (request: RouteRequest) => Promise<void>;
  actors: ActorOverlay[];
  fps: number;
}

const inputClass =
  'bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-white focus:border-sky-500 outline-none';

export const RouteDialog: React.FC<RouteDialogProps> = ({ isOpen, onClose, onCreate, actors, fps }) => {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [query, setQuery] = useState('');
  const [stops, setStops] = useState<Country[]>([]);
  const [secondsPerLeg, setSecondsPerLeg] = useState(2.5);
  const [pauseSeconds, setPauseSeconds] = useState(1);
  const [framing, setFraming] = useState<MapFraming>('world');
  const [highlight, setHighlight] = useState(true);
  const [labels, setLabels] = useState(true);
  const [arc, setArc] = useState(true);
  const [vehicleActorId, setVehicleActorId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen && !countries) loadWorld().then((w) => setCountries(w.countries));
  }, [isOpen, countries]);

  const matches = useMemo(() => {
    if (!countries || !query.trim()) return [];
    const q = query.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '');
    return countries
      .filter((c) => c.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '').includes(q))
      .slice(0, 8);
  }, [countries, query]);

  if (!isOpen) return null;

  const move = (i: number, dir: -1 | 1) =>
    setStops((s) => {
      const next = [...s];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });

  const totalSeconds =
    stops.length >= 2
      ? routeTotalFrames(stops.length, { fps, secondsPerLeg, pauseSeconds, landedScale: 1 }) / fps
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={() => !busy && onClose()}>
      <div
        className="w-[480px] max-h-[90vh] overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-5 space-y-4 text-xs text-neutral-300"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Globe2 size={16} className="text-sky-400" /> Rota no mapa
          </h3>
          <button onClick={onClose} disabled={busy} className="p-1 rounded text-neutral-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] text-neutral-500">
          Escolha os países na ordem da viagem. O avião sai do primeiro, pousa em cada um e segue para o próximo.
        </p>

        <div className="space-y-1.5 relative">
          <input
            autoFocus
            placeholder={countries ? 'Buscar país… (ex: Portugal)' : 'Carregando mapa…'}
            disabled={!countries}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                setStops((s) => [...s, matches[0]]);
                setQuery('');
              }
            }}
            className={`${inputClass} w-full`}
          />
          {matches.length > 0 && (
            <div className="absolute z-10 w-full bg-neutral-900 border border-neutral-800 rounded shadow-xl">
              {matches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setStops((s) => [...s, c]);
                    setQuery('');
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-neutral-800 text-neutral-200"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <ol className="space-y-1">
          {stops.map((c, i) => (
            <li key={`${c.id}-${i}`} className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded px-2 py-1">
              <span className="w-5 text-neutral-500 font-mono">{i + 1}.</span>
              <span className="flex-1 text-white">{c.name}</span>
              <button disabled={i === 0} onClick={() => move(i, -1)} className="p-0.5 disabled:opacity-20 hover:text-white">
                <ArrowUp size={12} />
              </button>
              <button disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="p-0.5 disabled:opacity-20 hover:text-white">
                <ArrowDown size={12} />
              </button>
              <button onClick={() => setStops((s) => s.filter((_, j) => j !== i))} className="p-0.5 hover:text-rose-400">
                <X size={12} />
              </button>
            </li>
          ))}
          {stops.length < 2 && <li className="text-[11px] text-neutral-500">Adicione pelo menos 2 países.</li>}
        </ol>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="block text-[10px] text-neutral-400">Segundos de voo por trecho</span>
            <input type="number" min={0.5} step={0.5} value={secondsPerLeg} onChange={(e) => setSecondsPerLeg(Math.max(0.5, Number(e.target.value)))} className={`${inputClass} w-full`} />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] text-neutral-400">Segundos parado em cada país</span>
            <input type="number" min={0} step={0.5} value={pauseSeconds} onChange={(e) => setPauseSeconds(Math.max(0, Number(e.target.value)))} className={`${inputClass} w-full`} />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] text-neutral-400">Enquadramento</span>
            <select value={framing} onChange={(e) => setFraming(e.target.value as MapFraming)} className={`${inputClass} w-full`}>
              <option value="world">Mundo inteiro</option>
              <option value="route">Aproximar nos países da rota</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] text-neutral-400">Veículo</span>
            <select value={vehicleActorId} onChange={(e) => setVehicleActorId(e.target.value)} className={`${inputClass} w-full`}>
              <option value="">Avião (padrão)</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  Imagem: {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="accent-sky-500" />
            Destacar países da rota
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="accent-sky-500" />
            Nome ao pousar
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={arc} onChange={(e) => setArc(e.target.checked)} className="accent-sky-500" />
            Voo em arco
          </label>
        </div>

        <button
          disabled={stops.length < 2 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onCreate({ stops, secondsPerLeg, pauseSeconds, framing, highlight, labels, arc, vehicleActorId: vehicleActorId || undefined });
              setStops([]);
            } finally {
              setBusy(false);
            }
          }}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plane size={14} />}
          Criar animação {totalSeconds > 0 && `(${totalSeconds.toFixed(1)}s)`}
        </button>
      </div>
    </div>
  );
};
