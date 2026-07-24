import { useState, useCallback } from "react";

export interface ContextMenuState {
  x: number;
  y: number;
  visible: boolean;
  type: "file" | "folder" | null;
  targetId: string | null;
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    visible: false,
    type: null,
    targetId: null,
  });

  const showMenu = useCallback((e: React.MouseEvent, type: "file" | "folder", targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
      type,
      targetId,
    });
  }, []);

  const hideMenu = useCallback(() => {
    setMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    menu,
    showMenu,
    hideMenu,
  };
}
export type ContextMenuHook = ReturnType<typeof useContextMenu>;
