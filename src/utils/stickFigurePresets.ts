import { t } from '../i18n';
import { StickFigure, Joint, Bone } from '../types';

export function createDefaultStickFigure(id: string = 'stick-1', name: string = t('selection.stick'), x: number = 300, y: number = 260): StickFigure {
  const joints: Record<string, Joint> = {
    head: { id: 'head', x: 0, y: -90, radius: 22 },
    neck: { id: 'neck', x: 0, y: -65 },
    chest: { id: 'chest', x: 0, y: -35 },
    pelvis: { id: 'pelvis', x: 0, y: 15 },
    
    // Left Arm
    lShoulder: { id: 'lShoulder', x: -16, y: -55 },
    lElbow: { id: 'lElbow', x: -40, y: -30 },
    lHand: { id: 'lHand', x: -45, y: 5 },

    // Right Arm
    rShoulder: { id: 'rShoulder', x: 16, y: -55 },
    rElbow: { id: 'rElbow', x: 40, y: -30 },
    rHand: { id: 'rHand', x: 45, y: 5 },

    // Left Leg
    lHip: { id: 'lHip', x: -14, y: 20 },
    lKnee: { id: 'lKnee', x: -20, y: 65 },
    lFoot: { id: 'lFoot', x: -22, y: 110 },

    // Right Leg
    rHip: { id: 'rHip', x: 14, y: 20 },
    rKnee: { id: 'rKnee', x: 20, y: 65 },
    rFoot: { id: 'rFoot', x: 22, y: 110 },
  };

  const bones: Bone[] = [
    // Spine
    { id: 'b_neck_chest', from: 'neck', to: 'chest' },
    { id: 'b_chest_pelvis', from: 'chest', to: 'pelvis' },

    // Left Arm
    { id: 'b_chest_lsh', from: 'chest', to: 'lShoulder' },
    { id: 'b_lsh_lelb', from: 'lShoulder', to: 'lElbow' },
    { id: 'b_lelb_lhnd', from: 'lElbow', to: 'lHand' },

    // Right Arm
    { id: 'b_chest_rsh', from: 'chest', to: 'rShoulder' },
    { id: 'b_rsh_relb', from: 'rShoulder', to: 'rElbow' },
    { id: 'b_relb_rhnd', from: 'rElbow', to: 'rHand' },

    // Left Leg
    { id: 'b_pelvis_lhip', from: 'pelvis', to: 'lHip' },
    { id: 'b_lhip_lknee', from: 'lHip', to: 'lKnee' },
    { id: 'b_lknee_lfoot', from: 'lKnee', to: 'lFoot' },

    // Right Leg
    { id: 'b_pelvis_rhip', from: 'pelvis', to: 'rHip' },
    { id: 'b_rhip_rknee', from: 'rHip', to: 'rKnee' },
    { id: 'b_rknee_rfoot', from: 'rKnee', to: 'rFoot' },
  ];

  return {
    id,
    name,
    color: '#38bdf8', // Neon Sky Blue
    thickness: 4,
    scale: 1,
    x,
    y,
    joints,
    bones,
  };
}

/** A ready-made pose. Its label is translated as `pose.<key>.name` / `pose.<key>.desc`. */
export interface StickPosePreset {
  joints: Record<string, { x: number; y: number }>;
}

export const STICK_POSE_PRESETS: Record<string, StickPosePreset> = {
  stand: {
    joints: {
      head: { x: 0, y: -90 },
      neck: { x: 0, y: -65 },
      chest: { x: 0, y: -35 },
      pelvis: { x: 0, y: 15 },
      lShoulder: { x: -16, y: -55 },
      lElbow: { x: -35, y: -25 },
      lHand: { x: -35, y: 10 },
      rShoulder: { x: 16, y: -55 },
      rElbow: { x: 35, y: -25 },
      rHand: { x: 35, y: 10 },
      lHip: { x: -14, y: 20 },
      lKnee: { x: -16, y: 65 },
      lFoot: { x: -18, y: 110 },
      rHip: { x: 14, y: 20 },
      rKnee: { x: 16, y: 65 },
      rFoot: { x: 18, y: 110 },
    },
  },
  pointingChart: {
    joints: {
      head: { x: 8, y: -90 },
      neck: { x: 4, y: -65 },
      chest: { x: 0, y: -35 },
      pelvis: { x: -4, y: 15 },
      lShoulder: { x: -18, y: -55 },
      lElbow: { x: -38, y: -30 },
      lHand: { x: -28, y: 15 },
      rShoulder: { x: 16, y: -55 },
      rElbow: { x: 60, y: -70 },
      rHand: { x: 105, y: -95 }, // Extended up/right toward chart!
      lHip: { x: -16, y: 20 },
      lKnee: { x: -18, y: 65 },
      lFoot: { x: -24, y: 110 },
      rHip: { x: 12, y: 20 },
      rKnee: { x: 26, y: 65 },
      rFoot: { x: 32, y: 110 },
    },
  },
  wave: {
    joints: {
      head: { x: 0, y: -90 },
      neck: { x: 0, y: -65 },
      chest: { x: 0, y: -35 },
      pelvis: { x: 0, y: 15 },
      lShoulder: { x: -16, y: -55 },
      lElbow: { x: -30, y: -20 },
      lHand: { x: -25, y: 15 },
      rShoulder: { x: 16, y: -55 },
      rElbow: { x: 50, y: -80 },
      rHand: { x: 65, y: -125 }, // Hand in the air!
      lHip: { x: -14, y: 20 },
      lKnee: { x: -16, y: 65 },
      lFoot: { x: -18, y: 110 },
      rHip: { x: 14, y: 20 },
      rKnee: { x: 16, y: 65 },
      rFoot: { x: 18, y: 110 },
    },
  },
  walkA: {
    joints: {
      head: { x: 5, y: -88 },
      neck: { x: 4, y: -63 },
      chest: { x: 2, y: -33 },
      pelvis: { x: 0, y: 15 },
      lShoulder: { x: -14, y: -53 },
      lElbow: { x: -40, y: -35 },
      lHand: { x: -55, y: -15 }, // Back
      rShoulder: { x: 18, y: -53 },
      rElbow: { x: 40, y: -30 },
      rHand: { x: 55, y: -50 }, // Forward
      lHip: { x: -14, y: 20 },
      lKnee: { x: 20, y: 60 },
      lFoot: { x: 45, y: 105 }, // Left leg front
      rHip: { x: 14, y: 20 },
      rKnee: { x: -25, y: 60 },
      rFoot: { x: -45, y: 105 }, // Right leg back
    },
  },
  walkB: {
    joints: {
      head: { x: 5, y: -88 },
      neck: { x: 4, y: -63 },
      chest: { x: 2, y: -33 },
      pelvis: { x: 0, y: 15 },
      lShoulder: { x: -14, y: -53 },
      lElbow: { x: -25, y: -30 },
      lHand: { x: 35, y: -50 }, // Forward
      rShoulder: { x: 18, y: -53 },
      rElbow: { x: 45, y: -35 },
      rHand: { x: -35, y: -15 }, // Back
      lHip: { x: -14, y: 20 },
      lKnee: { x: -25, y: 60 },
      lFoot: { x: -45, y: 105 }, // Left leg back
      rHip: { x: 14, y: 20 },
      rKnee: { x: 20, y: 60 },
      rFoot: { x: 45, y: 105 }, // Right leg front
    },
  },
  run: {
    joints: {
      head: { x: 25, y: -80 },
      neck: { x: 20, y: -55 },
      chest: { x: 12, y: -25 },
      pelvis: { x: 0, y: 20 },
      lShoulder: { x: -8, y: -45 },
      lElbow: { x: -45, y: -30 },
      lHand: { x: -70, y: -10 },
      rShoulder: { x: 25, y: -45 },
      rElbow: { x: 55, y: -40 },
      rHand: { x: 65, y: -75 },
      lHip: { x: -12, y: 20 },
      lKnee: { x: 35, y: 45 },
      lFoot: { x: 65, y: 95 },
      rHip: { x: 12, y: 20 },
      rKnee: { x: -40, y: 55 },
      rFoot: { x: -65, y: 80 },
    },
  },
  jump: {
    joints: {
      head: { x: 0, y: -105 },
      neck: { x: 0, y: -80 },
      chest: { x: 0, y: -50 },
      pelvis: { x: 0, y: -5 },
      lShoulder: { x: -20, y: -70 },
      lElbow: { x: -65, y: -90 },
      lHand: { x: -90, y: -125 },
      rShoulder: { x: 20, y: -70 },
      rElbow: { x: 65, y: -90 },
      rHand: { x: 90, y: -125 },
      lHip: { x: -16, y: 0 },
      lKnee: { x: -35, y: 35 },
      lFoot: { x: -20, y: 70 },
      rHip: { x: 16, y: 0 },
      rKnee: { x: 35, y: 35 },
      rFoot: { x: 20, y: 70 },
    },
  },
  kick: {
    joints: {
      head: { x: -25, y: -85 },
      neck: { x: -20, y: -60 },
      chest: { x: -15, y: -30 },
      pelvis: { x: 0, y: 15 },
      lShoulder: { x: -30, y: -50 },
      lElbow: { x: -55, y: -45 },
      lHand: { x: -40, y: -20 },
      rShoulder: { x: -5, y: -50 },
      rElbow: { x: 20, y: -65 },
      rHand: { x: 15, y: -90 },
      lHip: { x: -14, y: 20 },
      lKnee: { x: -18, y: 65 },
      lFoot: { x: -20, y: 110 },
      rHip: { x: 12, y: 15 },
      rKnee: { x: 50, y: -5 },
      rFoot: { x: 110, y: -35 }, // High Kick!
    },
  },
  thinker: {
    joints: {
      head: { x: 5, y: -90 },
      neck: { x: 0, y: -65 },
      chest: { x: 0, y: -35 },
      pelvis: { x: 0, y: 15 },
      lShoulder: { x: -16, y: -55 },
      lElbow: { x: -25, y: -15 },
      lHand: { x: 5, y: -25 }, // Supporting right elbow
      rShoulder: { x: 16, y: -55 },
      rElbow: { x: 15, y: -30 },
      rHand: { x: 12, y: -72 }, // Hand touching chin
      lHip: { x: -14, y: 20 },
      lKnee: { x: -16, y: 65 },
      lFoot: { x: -18, y: 110 },
      rHip: { x: 14, y: 20 },
      rKnee: { x: 16, y: 65 },
      rFoot: { x: 18, y: 110 },
    },
  },
};

export function applyPoseToStickFigure(stick: StickFigure, poseName: string): StickFigure {
  const pose = STICK_POSE_PRESETS[poseName];
  if (!pose) return stick;

  const updatedJoints = { ...stick.joints };
  for (const [key, coords] of Object.entries(pose.joints)) {
    if (updatedJoints[key]) {
      updatedJoints[key] = {
        ...updatedJoints[key],
        x: coords.x,
        y: coords.y,
      };
    }
  }

  return {
    ...stick,
    joints: updatedJoints,
  };
}
