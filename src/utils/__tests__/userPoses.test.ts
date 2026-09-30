import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteUserPose, mergeUserPoses, readUserPoses, saveUserPose } from '../userPoses';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('my poses', () => {
  it('saves, replaces by name and deletes', () => {
    const a = { head: { id: 'head', x: 0, y: -90 } };
    expect(saveUserPose('  Salto ', a)).toBe(true);
    expect(saveUserPose('', a)).toBe(false);
    saveUserPose('salto', { head: { id: 'head', x: 5, y: -90 } });
    const list = readUserPoses();
    expect(list.map((p) => [p.name, p.joints.head.x])).toEqual([['salto', 5]]);
    deleteUserPose(list[0].id);
    expect(readUserPoses()).toEqual([]);
  });

  it('ignores broken data', () => {
    localStorage.setItem('flashmotion.userPoses', '{oops');
    expect(readUserPoses()).toEqual([]);
    localStorage.setItem('flashmotion.userPoses', JSON.stringify([{ name: 'x' }, null, { name: 'ok', joints: {} }]));
    expect(readUserPoses().map((p) => p.name)).toEqual(['ok']);
  });

  it('merges poses from an opened project without overwriting or duplicating', () => {
    saveUserPose('Salto', { head: { id: 'head', x: 1, y: 1 } });
    const added = mergeUserPoses([
      { id: 'a', name: 'salto', joints: { head: { id: 'head', x: 9, y: 9 } } },
      { id: 'b', name: 'Chute', joints: { head: { id: 'head', x: 2, y: 2 } } },
      { id: 'c', name: 'chute ', joints: { head: { id: 'head', x: 3, y: 3 } } },
    ]);
    expect(added).toBe(1);
    expect(readUserPoses().map((p) => [p.name, p.joints.head.x])).toEqual([
      ['Salto', 1],
      ['Chute', 2],
    ]);
    expect(mergeUserPoses([])).toBe(0);
  });
});
