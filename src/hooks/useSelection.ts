import { useState, useCallback, useRef } from "react";

export function useSelection(allIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);

  const selectSingle = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
    lastSelectedIdRef.current = id;
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastSelectedIdRef.current = id;
  }, []);

  const selectRange = useCallback(
    (id: string) => {
      const anchor = lastSelectedIdRef.current;
      if (!anchor || !allIds.includes(anchor)) {
        selectSingle(id);
        return;
      }

      const anchorIdx = allIds.indexOf(anchor);
      const targetIdx = allIds.indexOf(id);

      if (anchorIdx === -1 || targetIdx === -1) {
        selectSingle(id);
        return;
      }

      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);

      const rangeSet = new Set<string>();
      for (let i = start; i <= end; i++) {
        rangeSet.add(allIds[i]);
      }

      setSelectedIds(rangeSet);
    },
    [allIds, selectSingle],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds));
  }, [allIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  const handleItemClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.shiftKey) {
        selectRange(id);
      } else if (e.ctrlKey || e.metaKey) {
        toggleSelect(id);
      } else {
        selectSingle(id);
      }
    },
    [selectSingle, toggleSelect, selectRange],
  );

  return {
    selectedIds,
    setSelectedIds,
    handleItemClick,
    selectAll,
    clearSelection,
    lastSelectedId: lastSelectedIdRef.current,
  };
}
export type SelectionHook = ReturnType<typeof useSelection>;
