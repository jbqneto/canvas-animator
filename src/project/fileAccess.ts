/**
 * Open/save project files. Uses the File System Access API (Chrome/Edge desktop, and installed PWAs)
 * so Ctrl+S overwrites the same file; falls back to download / file input elsewhere.
 */
import { PROJECT_EXTENSION } from './projectFile';
import { t } from '../i18n';

// Minimal typings: the File System Access API is not in TypeScript's DOM lib yet
interface WritableFileStream {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface ProjectFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFileStream>;
}
type PickerType = { description: string; accept: Record<string, string[]> };
declare global {
  interface Window {
    showOpenFilePicker?: (options: { types: PickerType[]; multiple?: boolean }) => Promise<ProjectFileHandle[]>;
    showSaveFilePicker?: (options: { types: PickerType[]; suggestedName?: string }) => Promise<ProjectFileHandle>;
  }
}

// A function so the description follows the current language
const pickerTypes = (): PickerType[] => [
  { description: t('project.fileType'), accept: { 'application/json': [PROJECT_EXTENSION] } },
];

export const supportsFileSystemAccess = () =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/** Returns the file text and (when supported) a handle to save back to, or null if cancelled. */
export async function openProjectFile(): Promise<{ text: string; fileName: string; handle?: ProjectFileHandle } | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: pickerTypes() });
      const file = await handle.getFile();
      return { text: await file.text(), fileName: file.name, handle };
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${PROJECT_EXTENSION},application/json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { text: await file.text(), fileName: file.name } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Saves the project. With a handle (and no "save as") it overwrites silently; otherwise asks where.
 * Returns the handle to reuse, `undefined` when the browser only supports download, or null if cancelled.
 */
export async function saveProjectFile(
  text: string,
  suggestedName: string,
  handle?: ProjectFileHandle,
  saveAs = false
): Promise<ProjectFileHandle | undefined | null> {
  const blob = new Blob([text], { type: 'application/json' });
  if (supportsFileSystemAccess()) {
    try {
      const target =
        handle && !saveAs
          ? handle
          : await window.showSaveFilePicker!({ types: pickerTypes(), suggestedName: `${suggestedName}${PROJECT_EXTENSION}` });
      const writable = await target.createWritable();
      await writable.write(blob);
      await writable.close();
      return target;
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${suggestedName}${PROJECT_EXTENSION}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return undefined;
}
