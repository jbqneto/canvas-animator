import type { VideoFileWriter } from './exportVideo';

/** Select a destination before mixing audio or rendering frames. */
export async function openVideoFile(name: string, extension: 'mp4' | 'webm'): Promise<VideoFileWriter> {
  const handle = await window.showSaveFilePicker!({
    suggestedName: `${name}.${extension}`,
    types: [{ description: extension.toUpperCase(), accept: { [`video/${extension}`]: [`.${extension}`] } }],
  });
  return handle.createWritable();
}
