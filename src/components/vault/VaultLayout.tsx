import React, { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";

interface VaultLayoutProps {
  sidebar: React.ReactNode;
  toolbar: React.ReactNode;
  content: React.ReactNode;
  statusBar: React.ReactNode;
}

export function VaultLayout({ sidebar, toolbar, content, statusBar }: VaultLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const layoutRef = useRef<HTMLDivElement>(null);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      if (newWidth >= 180 && newWidth <= 400) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      ref={layoutRef}
      className="flex h-full w-full overflow-hidden rounded-2xl border border-white/5 bg-[#090A0C]/30 text-foreground font-sans relative shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
    >
      {/* Mobile Sidebar Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden absolute top-3 left-4 z-50 p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-foreground cursor-pointer"
        aria-label="Toggle Sidebar"
      >
        {isMobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Sidebar - Desktop and Mobile Overlay */}
      <aside
        style={{ width: `${sidebarWidth}px` }}
        className={`shrink-0 h-full border-r border-white/5 bg-[#0B0C10] flex flex-col transition-transform duration-300 md:translate-x-0 absolute md:static top-0 bottom-0 left-0 z-40 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex-1 overflow-y-auto mt-14 md:mt-0">{sidebar}</div>
      </aside>

      {/* Resize Handle */}
      <div
        className="hidden md:block w-1 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors h-full shrink-0"
        onMouseDown={startResizing}
        aria-hidden="true"
      />

      {/* Main Workspace Panel */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-[#0A0A0C]">
        {/* Toolbar Slot */}
        <header className="shrink-0 pt-12 md:pt-0">{toolbar}</header>

        {/* Content Slot */}
        <main className="flex-1 overflow-hidden min-h-0 relative bg-[#090A0C]/50">{content}</main>

        {/* Status Bar Slot */}
        <footer className="shrink-0 h-8 border-t border-white/5 bg-[#08090C] px-6 flex items-center justify-between text-[10px] text-muted-foreground select-none">
          {statusBar}
        </footer>
      </div>

      {/* Mobile Drawer Overlay Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm z-30"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
export default VaultLayout;
