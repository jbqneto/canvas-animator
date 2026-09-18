import { useState, useCallback, useRef } from 'react';
import { HistorySnapshot } from '../types';

interface HistoryState {
  past: HistorySnapshot[];
  present: HistorySnapshot;
  future: HistorySnapshot[];
}

export function useHistory(initialSnapshot: HistorySnapshot) {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initialSnapshot,
    future: [],
  });

  const presentRef = useRef<HistorySnapshot>(initialSnapshot);
  presentRef.current = history.present;

  // Push new snapshot directly
  const pushSnapshot = useCallback(
    (description: string, newSnapshot: HistorySnapshot) => {
      setHistory((curr) => {
        // Limit history to 40 steps to keep memory light and snappy
        const newPast = [
          ...curr.past.slice(-39),
          { ...curr.present, description },
        ];
        return {
          past: newPast,
          present: newSnapshot,
          future: [],
        };
      });
    },
    []
  );

  // Transient update: updates present in place WITHOUT creating a history snapshot (for smooth dragging / scrubbing)
  const updatePresent = useCallback(
    (updater: (prev: HistorySnapshot) => HistorySnapshot) => {
      setHistory((curr) => ({
        ...curr,
        present: updater(curr.present),
      }));
    },
    []
  );

  // Commit an action with a known starting point (e.g. at end of drag-and-drop)
  // Saves baseSnapshot to past with description, sets finalSnapshot as present
  const commitAction = useCallback(
    (description: string, baseSnapshot: HistorySnapshot, finalSnapshot: HistorySnapshot) => {
      setHistory((curr) => {
        const newPast = [
          ...curr.past.slice(-39),
          { ...baseSnapshot, description },
        ];
        return {
          past: newPast,
          present: finalSnapshot,
          future: [],
        };
      });
    },
    []
  );

  const undo = useCallback((): HistorySnapshot | null => {
    let restored: HistorySnapshot | null = null;
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, curr.past.length - 1);
      restored = previous;
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
    return restored;
  }, []);

  const redo = useCallback((): HistorySnapshot | null => {
    let restored: HistorySnapshot | null = null;
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      restored = next;
      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture,
      };
    });
    return restored;
  }, []);

  const jumpToSnapshot = useCallback((index: number): HistorySnapshot | null => {
    let restored: HistorySnapshot | null = null;
    setHistory((curr) => {
      if (index < 0 || index >= curr.past.length) return curr;
      const target = curr.past[index];
      const newPast = curr.past.slice(0, index);
      const newFuture = [...curr.past.slice(index + 1), curr.present, ...curr.future];
      restored = target;
      return {
        past: newPast,
        present: target,
        future: newFuture,
      };
    });
    return restored;
  }, []);

  return {
    present: history.present,
    presentRef,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    past: history.past,
    future: history.future,
    pushSnapshot,
    updatePresent,
    commitAction,
    undo,
    redo,
    jumpToSnapshot,
  };
}
