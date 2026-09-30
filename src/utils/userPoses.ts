/**
 * Poses saved by the user ("My poses"), available in every project on this browser. Stored as joint
 * positions of the figure (local, unscaled), applied to any figure with the same joint names.
 */
import type { StickPose } from '../types';

const STORAGE_KEY = 'flashmotion.userPoses';
export const USER_POSES_CHANGED = 'flashmotion:user-poses-changed';

export interface UserPose {
  id: string;
  name: string;
  joints: StickPose;
}

export function readUserPoses(): UserPose[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === 'string' && p.joints) : [];
  } catch {
    return [];
  }
}

function write(list: UserPose[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(USER_POSES_CHANGED));
    return true;
  } catch {
    return false;
  }
}

/** Saves a pose; a pose with the same name (ignoring case) is replaced. */
export function saveUserPose(name: string, joints: StickPose): boolean {
  const clean = name.trim();
  if (!clean) return false;
  const list = readUserPoses().filter((p) => p.name.toLowerCase() !== clean.toLowerCase());
  return write([...list, { id: `pose-${Date.now()}`, name: clean, joints }]);
}

/**
 * Adds poses that came with an opened project. A pose whose name is already in this browser's list is
 * skipped, so opening a file never overwrites or duplicates the user's own poses. Returns how many were
 * added.
 */
export function mergeUserPoses(incoming: UserPose[]): number {
  const list = readUserPoses();
  const names = new Set(list.map((p) => p.name.toLowerCase()));
  const added = incoming.filter((p) => {
    const key = p.name.trim().toLowerCase();
    if (!key || names.has(key)) return false;
    names.add(key);
    return true;
  });
  if (added.length === 0) return 0;
  return write([...list, ...added.map((p, i) => ({ ...p, id: `pose-${Date.now()}-${i}`, name: p.name.trim() }))])
    ? added.length
    : 0;
}

export const deleteUserPose = (id: string) => write(readUserPoses().filter((p) => p.id !== id));
