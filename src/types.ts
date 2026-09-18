/**
 * Types for FlashMotion Studio - Adobe Flash & Remotion Hybrid Studio
 */

export interface CanvasDimensions {
  width: number;
  height: number;
  preset: 'youtube-1080p' | 'youtube-720p' | 'youtube-shorts' | 'square' | 'portrait' | 'ultrawide' | 'custom';
}

export const CANVAS_PRESETS: {
  id: CanvasDimensions['preset'];
  name: string;
  width: number;
  height: number;
  ratio: string;
}[] = [
  { id: 'youtube-1080p', name: 'YouTube Full HD (16:9)', width: 1920, height: 1080, ratio: '16:9' },
  { id: 'youtube-720p', name: 'YouTube HD (16:9)', width: 1280, height: 720, ratio: '16:9' },
  { id: 'youtube-shorts', name: 'YouTube Shorts / TikTok (9:16)', width: 1080, height: 1920, ratio: '9:16' },
  { id: 'square', name: 'Instagram / Feed (1:1)', width: 1080, height: 1080, ratio: '1:1' },
  { id: 'portrait', name: 'Social Retrato (4:5)', width: 1080, height: 1350, ratio: '4:5' },
  { id: 'ultrawide', name: 'Cinema Ultrawide (21:9)', width: 2560, height: 1080, ratio: '21:9' },
];

export interface Point {
  x: number;
  y: number;
}

export interface Joint {
  id: string;
  name: string;
  x: number;
  y: number;
  parent?: string;
  radius?: number;
  color?: string;
  isControlPoint?: boolean;
}

export interface Bone {
  id: string;
  from: string; // joint id
  to: string;   // joint id
  thickness?: number;
  color?: string;
}

export interface StickFigure {
  id: string;
  name: string;
  color: string;
  thickness: number;
  scale: number;
  x: number;
  y: number;
  joints: Record<string, Joint>;
  bones: Bone[];
  groupId?: string;
}

export interface DrawingStroke {
  id: string;
  tool: 'pen' | 'line' | 'rect' | 'circle' | 'arrow';
  points: Point[];
  color: string;
  thickness: number;
  fill?: string;
  groupId?: string;
}

export interface CanvasGroup {
  id: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  strokeIds: string[];
  stickFigureId?: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
}

export type ChartType = 'bar' | 'donut' | 'line' | 'stat';

export interface ChartOverlay {
  id: string;
  title: string;
  type: ChartType;
  x: number; // canvas pixels 0..1280
  y: number; // canvas pixels 0..720
  width: number;
  height: number;
  startFrame: number;
  durationFrames: number;
  data: ChartDataPoint[];
  statMetric?: {
    value: string;
    suffix: string;
    label: string;
  };
  animationType: 'grow' | 'fade' | 'bounce' | 'slideUp' | 'elastic';
  visible: boolean;
  // Motion Tween / Interpolação de Posição (Posição 1 -> Posição 2)
  endX?: number;
  endY?: number;
  hasMotionTween?: boolean;
  easing?: 'easeOut' | 'easeInOut' | 'linear' | 'bounce';
  animDurationFrames?: number;
}

export type TextEffect =
  | 'typewriter'
  | 'bouncePop'
  | 'slideLeft'
  | 'glowPulse'
  | 'fadeRise'
  | 'numberRoll';

export interface TextOverlay {
  id: string;
  text: string;
  subtitle?: string;
  x: number; // canvas pixels 0..1280
  y: number; // canvas pixels 0..720
  fontSize: number;
  color: string;
  bgColor?: string;
  effect: TextEffect;
  startFrame: number;
  durationFrames: number;
  badge?: string;
  visible: boolean;
  // Number counter capabilities
  isNumberCounter?: boolean;
  counterStart?: number;
  counterEnd?: number;
  counterPrefix?: string;
  counterSuffix?: string;
  counterDecimals?: number;
  // Motion Tween / Interpolação de Posição (Posição 1 -> Posição 2)
  endX?: number;
  endY?: number;
  hasMotionTween?: boolean;
  easing?: 'easeOut' | 'easeInOut' | 'linear' | 'bounce';
  animDurationFrames?: number;
}

export interface ImageOverlay {
  id: string;
  url: string;
  x: number; // canvas pixels 0..1280
  y: number; // canvas pixels 0..720
  width: number;
  height: number;
  startFrame: number;
  durationFrames: number;
  animationType: 'pop' | 'fade' | 'float';
}

export interface FrameData {
  frameNumber: number;
  stickFigures: StickFigure[];
  drawings: DrawingStroke[];
  groups?: CanvasGroup[];
}

export type LayerType = 'drawing' | 'chart' | 'text' | 'group' | 'video' | 'image';

export interface StudioLayer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  color: string;
  opacity?: number;
  targetId?: string; // links to specific chart, text, stick, or group
}

export interface VideoBackground {
  type: 'preset' | 'upload' | 'color';
  url?: string;
  color?: string;
  opacity: number;
  playbackRate: number;
}

export type SelectedObjectType =
  | 'stick'
  | 'chart'
  | 'text'
  | 'image'
  | 'drawing'
  | 'group'
  | null;

export interface SelectedObjectRef {
  type: SelectedObjectType;
  id: string;
}

export interface HistorySnapshot {
  description: string;
  layers: StudioLayer[];
  frames: Record<number, FrameData>;
  charts: ChartOverlay[];
  texts: TextOverlay[];
  images: ImageOverlay[];
  groups?: CanvasGroup[];
  videoBg?: VideoBackground;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actionPayload?: {
    type: 'chart' | 'text' | 'pose' | 'script';
    data: any;
  };
}

export type ChatRole = 'general' | 'choreographer' | 'educator' | 'generator';
