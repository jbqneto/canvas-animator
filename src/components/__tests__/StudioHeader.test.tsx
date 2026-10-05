// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioHeader } from '../StudioHeader';
import { I18nProvider, t } from '../../i18n';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const noop = () => {};
let root: Root;
let container: HTMLDivElement;
const properties = vi.fn();
function header(aiEnabled: boolean, canGroup = false, canUngroup = false) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<I18nProvider><StudioHeader aiEnabled={aiEnabled}
    onExportVideo={noop} isExporting={false} exportProgress={0}
    onAddLayer={noop} onAddShape={noop} onImportImages={noop}
    onOpenAiImage={noop} onOpenTemplates={noop} onToggleChatbot={noop} chatbotOpen={false}
    onLoadPreset={noop} onResetProject={noop} canUndo={false} canRedo={false} onUndo={noop} onRedo={noop}
    onGroupSelected={noop} onUngroupSelected={noop} canGroup={canGroup} canUngroup={canUngroup}
    onDocumentProperties={properties}
    projectName="Test" isDirty={false} autosaveStatus="idle" autosaveSavedAt={null}
    onRetryAutosave={noop} onOpenProject={noop} onSaveProject={noop} /></I18nProvider>));
}
function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === label);
  expect(button).toBeDefined(); act(() => { button!.dispatchEvent(new Event('pointerdown', { bubbles: true })); button!.click(); });
}
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });
describe('Desktop editor menus', () => {
  it('keeps export visible and secondary actions inside menus', () => {
    header(false);
    expect(container.textContent).toContain(t('header.exportButton'));
    expect(container.textContent).not.toContain('Ctrl+Z');
    expect(container.textContent).not.toContain(t('header.snapshot'));
    click(t('workspace.file'));
    expect(container.textContent).toContain(t('workspace.open'));
    expect(container.textContent).toContain(t('workspace.save'));
    click(t('workspace.document'));
    click(t('workspace.documentProperties'));
    expect(properties).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
  it.each([false, true])('only exposes AI when enabled: %s', enabled => {
    header(enabled); click(t('workspace.insert'));
    expect(container.textContent?.includes(t('header.aiImage'))).toBe(enabled);
    expect(container.textContent?.includes(t('header.copilot'))).toBe(enabled);
  });
  it.each([[false,false], [true,false], [false,true]])('shows grouping only when supported (%s/%s)', (group, ungroup) => {
    header(false, group, ungroup); click(t('workspace.edit'));
    expect(container.textContent?.includes(t('selection.groupShort'))).toBe(group);
    expect(container.textContent?.includes(t('selection.ungroupShort'))).toBe(ungroup);
  });
  it('closes menus on Escape and returns focus to their trigger', () => {
    header(false); click(t('workspace.edit'));
    const menu = container.querySelector('[role="menu"]')!;
    act(() => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe(t('workspace.edit'));
  });
});
