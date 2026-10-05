import React, { useEffect, useRef, useState } from 'react';
import { Film, Download, Loader2, ChevronDown } from 'lucide-react';
import { ShapeType } from '../types';
import { SHAPE_TYPES } from '../engine/shapes';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AutosaveIndicator } from './AutosaveIndicator';
import type { AutosaveStatus } from '../project/useAutosave';

interface StudioHeaderProps {
  onExportVideo: () => void;
  isExporting: boolean;
  exportProgress: number;
  aiEnabled: boolean;
  onOpenAiImage: () => void;
  onOpenTemplates: () => void;
  onAddLayer: (type: 'chart' | 'text' | 'group') => void;
  onAddShape: (type: ShapeType) => void;
  onImportImages: (files: FileList) => void;
  onToggleChatbot: () => void;
  chatbotOpen: boolean;
  onLoadPreset: (presetName: string) => void;
  onResetProject: () => void;
  // History & Grouping
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  canGroup: boolean;
  canUngroup: boolean;
  onDocumentProperties: () => void;
  agentControls?: React.ReactNode;
  agentStatus?: string;
  projectName: string;
  isDirty: boolean;
  autosaveStatus: AutosaveStatus;
  autosaveSavedAt: number | null;
  onRetryAutosave: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
}


// Menus keep secondary actions discoverable without occupying the stage toolbar.
function AppMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className="relative shrink-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      if ((e.target as HTMLElement).tagName === 'SELECT') return;
      e.stopPropagation();
      e.preventDefault();
      if (!open) { setOpen(true); requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()); return; }
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>(['[role="menuitem"]:not(:disabled)', 'select'].join(',')) ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }}>
    <button ref={trigger} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
      className={`flex items-center gap-1 rounded px-2.5 py-1.5 text-xs transition ${open ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}`}>
      {label}<ChevronDown size={10} className="text-neutral-500" />
    </button>
    {open && <div role="menu" aria-label={label} onClick={e => {
      if ((e.target as HTMLElement).closest('[role="menuitem"]')) { setOpen(false); trigger.current?.focus(); }
    }} className="absolute top-full left-0 mt-1 w-64 max-h-[75vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1.5 shadow-2xl z-50">{children}</div>}
  </div>;
}
function MenuAction({ children, onClick, disabled, shortcut }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; shortcut?: string }) {
  return <button role="menuitem" disabled={disabled} onClick={onClick} className="w-full flex items-center justify-between gap-4 rounded px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none disabled:opacity-35">
    <span>{children}</span>{shortcut && <span className="text-[10px] text-neutral-500 font-mono">{shortcut}</span>}
  </button>;
}
const Divider = () => <div role="separator" className="my-1 border-t border-neutral-800" />;

export const StudioHeader: React.FC<StudioHeaderProps> = props => {
  const { t } = useI18n();
  const images = useRef<HTMLInputElement>(null);
  return <header className="min-h-14 px-3 py-2 bg-neutral-950 border-b border-neutral-800 flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0 select-none z-30">
    <div className="flex items-center gap-2 shrink-0" title="FlashMotion Studio">
      <div className="w-7 h-7 rounded-md bg-sky-500 flex items-center justify-center text-neutral-950"><Film size={17} /></div>
      <span className="hidden xl:block font-semibold text-xs text-neutral-200">FlashMotion <span className="text-sky-400">Studio</span></span>
    </div>
    <input ref={images} type="file" accept="image/*" multiple hidden onChange={e => {
      if (e.target.files?.length) props.onImportImages(e.target.files);
      e.target.value = '';
    }} />
    <nav aria-label={t('workspace.file')} className="flex items-center">
      <AppMenu label={t('workspace.file')}>
        <MenuAction onClick={props.onOpenProject} shortcut="Ctrl+O">{t('workspace.open')}</MenuAction>
        <MenuAction onClick={props.onSaveProject} shortcut="Ctrl+S">{t('workspace.save')}</MenuAction>
        <Divider />
        <MenuAction onClick={props.onExportVideo} disabled={props.isExporting}>{t('header.exportButton')}</MenuAction>
      </AppMenu>
      <AppMenu label={t('workspace.edit')}>
        <MenuAction onClick={props.onUndo} disabled={!props.canUndo} shortcut="Ctrl+Z">{t('workspace.undo')}</MenuAction>
        <MenuAction onClick={props.onRedo} disabled={!props.canRedo} shortcut="Ctrl+Y">{t('workspace.redo')}</MenuAction>
        {(props.canGroup || props.canUngroup) && <Divider />}
        {props.canGroup && <MenuAction onClick={props.onGroupSelected} shortcut="Ctrl+G">{t('selection.groupShort')}</MenuAction>}
        {props.canUngroup && <MenuAction onClick={props.onUngroupSelected} shortcut="Ctrl+B">{t('selection.ungroupShort')}</MenuAction>}
        <Divider /><MenuAction onClick={props.onResetProject}>{t('workspace.clearScene')}</MenuAction>
      </AppMenu>
      <AppMenu label={t('workspace.insert')}>
        <MenuAction onClick={props.onOpenTemplates}>{t('templates.button')}</MenuAction>
        <MenuAction onClick={() => images.current?.click()}>{t('workspace.importImage')}</MenuAction>
        <MenuAction onClick={() => props.onAddLayer('text')}>{t('timeline.layer.text')}</MenuAction>
        <MenuAction onClick={() => props.onAddLayer('chart')}>{t('timeline.layer.chart')}</MenuAction>
        <MenuAction onClick={() => props.onAddLayer('group')}>{t('inspector.doc.addStick')}</MenuAction>
        {SHAPE_TYPES.map(type => <MenuAction key={type} onClick={() => props.onAddShape(type)}>{t(`shape.type.${type}`)}</MenuAction>)}
        <Divider />
        <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">{t('workspace.examples')}</p>
        <MenuAction onClick={() => props.onLoadPreset('presenter')}>{t('header.example.presenter')}</MenuAction>
        <MenuAction onClick={() => props.onLoadPreset('walkcycle')}>{t('header.example.walkcycle')}</MenuAction>
        <MenuAction onClick={() => props.onLoadPreset('action')}>{t('header.example.action')}</MenuAction>
        {props.aiEnabled && <><Divider />
          <MenuAction onClick={props.onOpenAiImage}>{t('header.aiImage')}</MenuAction>
          <MenuAction onClick={props.onToggleChatbot}>{t('header.copilot')}</MenuAction>
        </>}
      </AppMenu>
      <AppMenu label={t('workspace.document')}>
        <MenuAction onClick={props.onDocumentProperties}>{t('workspace.documentProperties')}</MenuAction>
      </AppMenu>
      <AppMenu label={t('workspace.settings')}>
        <div className="p-2"><LanguageSwitcher /></div>
        <Divider />
        <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">{t('workspace.agents')}</p>
        <div className="p-2 text-xs">{props.agentControls}</div>
      </AppMenu>
    </nav>
    <div className="flex-1 min-w-0 hidden md:block">
      <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-300" title={props.projectName}>
        <span className="truncate max-w-64">{props.projectName}</span>{props.isDirty && <span className="w-1 h-1 bg-amber-400 rounded-full shrink-0" />}
      </div>
      <div className="flex justify-center"><AutosaveIndicator status={props.autosaveStatus} savedAt={props.autosaveSavedAt} onRetry={props.onRetryAutosave} /></div>
    </div>
    <div className="ml-auto flex items-center gap-3 shrink-0">
      {props.agentStatus && <span role="status" title={props.agentStatus} className="hidden lg:flex items-center gap-1.5 text-[10px] text-neutral-400"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />MCP</span>}
      <button onClick={props.onExportVideo} disabled={props.isExporting} title={t('header.export')}
        className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-neutral-950 font-semibold text-xs transition">
        {props.isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {props.isExporting ? t('header.exporting', { progress: props.exportProgress }) : t('header.exportButton')}
      </button>
    </div>
  </header>;
};
