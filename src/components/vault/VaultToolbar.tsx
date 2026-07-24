import React from "react";
import { Grid, List, ArrowUpDown, RefreshCw, Upload, FolderPlus, ChevronRight } from "lucide-react";

interface Breadcrumb {
  id: string | null;
  name: string;
}

interface VaultToolbarProps {
  breadcrumbs: Breadcrumb[];
  viewMode: "grid" | "list";
  sortField: string;
  sortDir: "asc" | "desc";
  onNavigate: (id: string | null) => void;
  onToggleView: () => void;
  onSortChange: (field: string, dir: "asc" | "desc") => void;
  onCreateFolder: () => void;
  onUploadMock: () => void;
  onRefresh: () => void;
}

export function VaultToolbar({
  breadcrumbs,
  viewMode,
  sortField,
  sortDir,
  onNavigate,
  onToggleView,
  onSortChange,
  onCreateFolder,
  onUploadMock,
  onRefresh,
}: VaultToolbarProps) {
  const sortOptions = [
    { value: "name", label: "Name" },
    { value: "createdAt", label: "Date Created" },
    { value: "updatedAt", label: "Date Modified" },
    { value: "size", label: "Size" },
    { value: "type", label: "File Type" },
  ];

  return (
    <div className="flex flex-col gap-4 px-6 py-4 bg-white/[0.01] border-b border-white/5">
      {/* Top Row: Path and actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 overflow-x-auto py-1">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id || `crumb-${idx}`}>
                {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/45 shrink-0" />}
                <button
                  onClick={() => !isLast && onNavigate(crumb.id)}
                  disabled={isLast}
                  className={`text-sm tracking-tight transition-colors truncate max-w-[120px] cursor-pointer ${
                    isLast
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onUploadMock}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Mock</span>
          </button>

          <button
            onClick={onCreateFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>New Folder</span>
          </button>

          <button
            onClick={onRefresh}
            className="p-2 hover:bg-white/5 border border-transparent hover:border-white/5 rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Row: View controls and sorting */}
      <div className="flex items-center justify-between gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground/60">Sorting by</span>
          <select
            value={sortField}
            onChange={(e) => onSortChange(e.target.value, sortDir)}
            className="bg-transparent border-0 font-medium text-foreground cursor-pointer focus:ring-0 select-none py-0.5 outline-none px-1"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-neutral-900 text-foreground">
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onSortChange(sortField, sortDir === "asc" ? "desc" : "asc")}
            className="p-1 hover:bg-white/5 rounded transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-0.5 bg-white/[0.02] border border-white/5 p-0.5 rounded-xl">
          <button
            onClick={() => viewMode !== "grid" && onToggleView()}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === "grid"
                ? "bg-white/10 text-white font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Grid View"
          >
            <Grid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => viewMode !== "list" && onToggleView()}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === "list"
                ? "bg-white/10 text-white font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="List View"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
export default VaultToolbar;
