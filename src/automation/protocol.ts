import { z } from 'zod';
import { EASING_NAMES, type EasingName } from '../engine/keyframes';

export const MAX_BRIDGE_BYTES = 50 * 1024 * 1024;
const easingSchema = z.enum(EASING_NAMES as [EasingName, ...EasingName[]]);
const keysSchema = z
  .array(z.object({ frame: z.number().int().min(1), value: z.number().finite(), easing: easingSchema.optional() }).strict())
  .max(500);
export const cameraSchema = z
  .object({
    base: z
      .object({ panX: z.number().finite(), panY: z.number().finite(), zoom: z.number().finite(), rotation: z.number().finite() })
      .partial()
      .strict()
      .optional(),
    tracks: z.object({ panX: keysSchema, panY: keysSchema, zoom: keysSchema, rotation: keysSchema }).partial().strict().optional(),
  })
  .strict();
export const commandSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('get_status') }).strict(),
  z.object({ method: z.literal('get_project') }).strict(),
  z.object({ method: z.literal('replace_content'), content: z.record(z.unknown()), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ method: z.literal('seek'), frame: z.number().int().min(1) }).strict(),
  z.object({ method: z.literal('set_playing'), playing: z.boolean() }).strict(),
  z.object({ method: z.literal('render_frame'), frame: z.number().int().min(1) }).strict(),
  z.object({ method: z.literal('load_project'), file: z.string().min(2).max(45 * 1024 * 1024) }).strict(),
  z.object({ method: z.literal('export_start'), format: z.enum(['mp4', 'webm-alpha']).optional(),
    startFrame: z.number().int().min(1).optional(), endFrame: z.number().int().min(1).optional() }).strict(),
  z.object({ method: z.literal('export_status') }).strict(),
  z.object({ method: z.literal('export_chunk'), offset: z.number().int().min(0), length: z.number().int().min(1).max(16 * 1024 * 1024) }).strict(),
  z.object({ method: z.literal('set_camera'), camera: cameraSchema.nullable() }).strict(),
  z.object({ method: z.literal('list_templates') }).strict(),
  z.object({
    method: z.literal('render_contact_sheet'),
    frames: z.array(z.number().int().min(1)).min(1).max(24),
    columns: z.number().int().min(1).max(6).optional(),
    cellWidth: z.number().int().min(160).max(960).optional(),
  }).strict(),
  z.object({
    method: z.literal('apply_template'),
    templateId: z.string().min(1).max(64),
    values: z.record(z.union([z.string().max(2000), z.number()])).optional(),
    startFrame: z.number().int().min(1).optional(),
  }).strict(),
]);
export type BridgeCommand = z.infer<typeof commandSchema>;
export const callSchema = z.object({ windowId: z.string().uuid(), command: commandSchema }).strict();
export const statusSchema = z.object({
  name: z.string().max(1000), frame: z.number().int(), fps: z.number(), totalFrames: z.number().int(),
  playing: z.boolean(), dirty: z.boolean(), ready: z.boolean(), exporting: z.boolean(),
}).strict();
