import { z } from 'zod';

export const MAX_BRIDGE_BYTES = 50 * 1024 * 1024;
export const commandSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('get_status') }).strict(),
  z.object({ method: z.literal('get_project') }).strict(),
  z.object({ method: z.literal('replace_content'), content: z.record(z.unknown()), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ method: z.literal('seek'), frame: z.number().int().min(1) }).strict(),
  z.object({ method: z.literal('set_playing'), playing: z.boolean() }).strict(),
  z.object({ method: z.literal('render_frame'), frame: z.number().int().min(1) }).strict(),
]);
export type BridgeCommand = z.infer<typeof commandSchema>;
export const callSchema = z.object({ windowId: z.string().uuid(), command: commandSchema }).strict();
export const statusSchema = z.object({
  name: z.string().max(1000), frame: z.number().int(), fps: z.number(), totalFrames: z.number().int(),
  playing: z.boolean(), dirty: z.boolean(), ready: z.boolean(), exporting: z.boolean(),
}).strict();
