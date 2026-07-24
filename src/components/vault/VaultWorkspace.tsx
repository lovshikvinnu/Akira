import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useVault } from "../../hooks/useVault";
import { useSelection } from "../../hooks/useSelection";
import { useFolderTree } from "../../hooks/useFolderTree";
import { useContextMenu } from "../../hooks/useContextMenu";
import { useDragDrop } from "../../hooks/useDragDrop";
import { useUploadQueue } from "../../hooks/useUploadQueue";
import { VaultLayout } from "./VaultLayout";
import { VaultSidebar } from "./VaultSidebar";
import { VaultToolbar } from "./VaultToolbar";
import { FileGrid } from "./FileGrid";
import { FileList } from "./FileList";
import { EmptyState } from "./EmptyState";
import { ContextMenu } from "./ContextMenu";
import { MetadataPanel } from "./MetadataPanel";
import { PreviewPanel } from "./PreviewPanel";
import { UploadQueue } from "./UploadQueue";
import { TagEditor } from "./TagEditor";
import { TrashView } from "./TrashView";
import { FavoritesBar } from "./FavoritesBar";
import { akira } from "../../persistence/akira-store";

export function VaultWorkspace() {
  const vault = useVault();
  const contextMenu = useContextMenu();
  const uploadQueue = useUploadQueue();

  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [tagEditingFileId, setTagEditingFileId] = useState<string | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const allItemIds = React.useMemo(() => {
    const folderIds = vault.folders.map((f) => f.id);
    const fileIds = vault.files.map((f) => f.id);
    return [...folderIds, ...fileIds];
  }, [vault.folders, vault.files]);

  const selection = useSelection(allItemIds);
  const tree = useFolderTree(vault.allFolders);

  const dragDrop = useDragDrop(
    vault.moveFile,
    vault.moveFolder,
    tree.toggleExpand,
    tree.expandedFolderIds,
    vault.allFolders,
  );

  // Resolve single selected file
  const selectedFile = React.useMemo(() => {
    if (selection.selectedIds.size !== 1) return null;
    const selectedId = Array.from(selection.selectedIds)[0];
    return vault.allFiles.find((f) => f.id === selectedId) || null;
  }, [selection.selectedIds, vault.allFiles]);

  const previewFile = React.useMemo(() => {
    if (!activePreviewId) return null;
    return vault.allFiles.find((f) => f.id === activePreviewId) || null;
  }, [activePreviewId, vault.allFiles]);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selection.selectAll();
      }
      if (e.key === "Escape") {
        selection.clearSelection();
        setActivePreviewId(null);
      }
      if (e.key === "Delete" && selection.selectedIds.size > 0) {
        let count = 0;
        selection.selectedIds.forEach((id) => {
          const isFile = vault.allFiles.some((f) => f.id === id);
          if (isFile) {
            vault.deleteFile(id);
            count++;
          }
        });
        if (count > 0) {
          toast.success(`Moved ${count} files to Trash`);
          selection.clearSelection();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection, vault]);

  const handleUploadMock = () => {
    const fileOptions = [
      {
        name: "invoice_report.pdf",
        mime: "application/pdf",
        content: "%PDF-1.4\n%mock invoice payload",
      },
      {
        name: "profile_image.png",
        mime: "image/png",
        content: "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR",
      },
      {
        name: "source_code.ts",
        mime: "text/typescript",
        content: "export const Akira = () => { return 'Master'; };",
      },
      { name: "archive_backup.zip", mime: "application/zip", content: "PK\x03\x04\n\x00\x00\x00" },
    ];

    const choice = fileOptions[Math.floor(Math.random() * fileOptions.length)];
    const customName = prompt("Enter mock upload filename:", choice.name);
    if (!customName) return;

    uploadQueue.addUpload(customName, choice.mime, choice.content, vault.folderId);
    setIsQueueOpen(true);
  };

  const handleCreateFolder = () => {
    const name = prompt("Enter folder name:") || "";
    if (name.trim()) {
      const newId = vault.addFolder(name);
      toast.success(`Created folder: ${name}`);
      tree.toggleExpand(newId);
    }
  };

  const handleEmptyTrash = () => {
    const trashFiles = vault.allFiles.filter((f) => f.deletedAt !== null);
    if (trashFiles.length === 0) return;
    if (confirm(`Are you sure you want to permanently delete all ${trashFiles.length} items?`)) {
      trashFiles.forEach((f) => vault.permanentDeleteFile(f.id));
      toast.success("Trash emptied successfully");
      selection.clearSelection();
    }
  };

  const handleRestoreAll = () => {
    const trashFiles = vault.allFiles.filter((f) => f.deletedAt !== null);
    if (trashFiles.length === 0) return;
    trashFiles.forEach((f) => vault.restoreFile(f.id));
    toast.success(`Restored ${trashFiles.length} files`);
  };

  // Context Menu Actions
  const handleOpenItem = (id: string) => {
    const isFolder = vault.allFolders.some((f) => f.id === id);
    if (isFolder) {
      vault.navigateToFolder(id);
      selection.clearSelection();
    } else {
      setActivePreviewId(id);
    }
  };

  const handleRenameItem = (id: string) => {
    const isFolder = vault.allFolders.some((f) => f.id === id);
    if (isFolder) {
      const folder = vault.allFolders.find((f) => f.id === id);
      const name = prompt("Rename folder:", folder?.name);
      if (name?.trim()) vault.renameFolder(id, name);
    } else {
      const file = vault.allFiles.find((f) => f.id === id);
      const name = prompt("Rename file:", file?.displayName);
      if (name?.trim()) vault.renameFile(id, name);
    }
  };

  const handleMoveItem = (id: string) => {
    const targetFolderId = prompt("Enter target Folder ID (or leave blank for Root / Null):");
    const resolvedId = targetFolderId ? targetFolderId.trim() : null;

    const isFolder = vault.allFolders.some((f) => f.id === id);
    if (isFolder) {
      try {
        vault.moveFolder(id, resolvedId);
        toast.success("Folder moved successfully");
      } catch (err: any) {
        toast.error(err.message);
      }
    } else {
      vault.moveFile(id, resolvedId);
      toast.success("File moved successfully");
    }
  };

  const handleDeleteItem = (id: string) => {
    const isFolder = vault.allFolders.some((f) => f.id === id);
    if (isFolder) {
      if (
        confirm(
          "Are you sure you want to delete this folder? Contained files will be orphaned to Root.",
        )
      ) {
        vault.deleteFolder(id);
        toast.success("Folder deleted");
      }
    } else {
      vault.deleteFile(id);
      toast.success("File moved to Trash");
    }
  };

  // Render Slots
  const sidebar = (
    <VaultSidebar
      folders={vault.allFolders}
      activeFolderId={vault.folderId}
      showFavorites={vault.showFavorites}
      showDeleted={vault.showDeleted}
      filterTag={vault.filterTag}
      expandedFolderIds={tree.expandedFolderIds}
      toggleExpand={tree.toggleExpand}
      onSelectFolder={vault.navigateToFolder}
      onSelectFavorites={vault.navigateToFavorites}
      onSelectTrash={vault.navigateToTrash}
      onSelectTag={vault.filterByTag}
      onCreateFolder={(name) => {
        vault.addFolder(name);
        toast.success(`Created folder: ${name}`);
      }}
    />
  );

  const toolbar = (
    <VaultToolbar
      breadcrumbs={vault.breadcrumbs}
      viewMode={vault.viewMode}
      sortField={vault.sortField}
      sortDir={vault.sortDir}
      onNavigate={vault.navigateToFolder}
      onToggleView={vault.toggleViewMode}
      onSortChange={(field, dir) => vault.setSort(field, dir)}
      onCreateFolder={handleCreateFolder}
      onUploadMock={handleUploadMock}
      onRefresh={() => toast.success("Refreshed storage records")}
    />
  );

  const content = (
    <div className="flex h-full w-full relative">
      {/* Main Files Window */}
      <div
        className="flex-1 flex flex-col min-w-0 h-full overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => dragDrop.handleDropItem(e, vault.folderId)}
      >
        {/* Trash Actions banner */}
        {vault.showDeleted && (
          <TrashView
            files={vault.files}
            onRestoreAll={handleRestoreAll}
            onEmptyTrash={handleEmptyTrash}
          />
        )}

        {/* Favorites bar banner */}
        {!vault.showDeleted && !vault.showFavorites && !vault.filterTag && (
          <FavoritesBar
            files={vault.allFiles}
            onSelectFile={(file) => setActivePreviewId(file.id)}
          />
        )}

        <div className="flex-1 overflow-hidden min-h-0 relative">
          {vault.folders.length === 0 && vault.files.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center p-8 select-none">
              <EmptyState
                title={
                  vault.showDeleted
                    ? "Trash is empty"
                    : vault.showFavorites
                      ? "No favorites found"
                      : vault.filterTag
                        ? `No files tagged '${vault.filterTag}'`
                        : "Empty Directory"
                }
                description={
                  vault.showDeleted
                    ? "Files moved to Trash will appear here."
                    : vault.showFavorites
                      ? "Star important files to view them here."
                      : "Create a folder or upload a mock file to start."
                }
              />
            </div>
          ) : vault.viewMode === "list" ? (
            <FileList
              folders={vault.folders}
              files={vault.files}
              selectedIds={selection.selectedIds}
              onItemClick={selection.handleItemClick}
              onOpenFolder={vault.navigateToFolder}
              onToggleFavorite={vault.setFavorite}
              onContextMenu={(e, type, id) => contextMenu.showMenu(e, type, id)}
            />
          ) : (
            <FileGrid
              folders={vault.folders}
              files={vault.files}
              selectedIds={selection.selectedIds}
              onItemClick={selection.handleItemClick}
              onOpenFolder={vault.navigateToFolder}
              onToggleFavorite={vault.setFavorite}
              onContextMenu={(e, type, id) => contextMenu.showMenu(e, type, id)}
            />
          )}
        </div>
      </div>

      {/* Side Inspector Panel (Split details column) */}
      {(selectedFile || previewFile) && (
        <div className="hidden lg:flex w-80 shrink-0 border-l border-white/5 bg-[#0B0C10] flex-col h-full overflow-hidden">
          {selectedFile && (
            <div className="flex-1 overflow-y-auto">
              <MetadataPanel
                file={selectedFile}
                folders={vault.allFolders}
                onToggleFavorite={vault.setFavorite}
                onEditTags={() => setTagEditingFileId(selectedFile.id)}
              />
            </div>
          )}
          {previewFile && (
            <div className="flex-1 border-t border-white/5 overflow-hidden">
              <PreviewPanel file={previewFile} onClose={() => setActivePreviewId(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  const statusBar = (
    <>
      <div className="flex items-center gap-3">
        <span>{vault.files.length} Files</span>
        <span className="w-1 h-1 rounded-full bg-white/20" />
        <span>{vault.folders.length} Folders</span>
      </div>
      <div>
        {selection.selectedIds.size > 0 && (
          <span className="font-semibold text-white">{selection.selectedIds.size} Selected</span>
        )}
      </div>
    </>
  );

  return (
    <>
      <VaultLayout sidebar={sidebar} toolbar={toolbar} content={content} statusBar={statusBar} />

      {/* Context Menu Overlay */}
      {contextMenu.menu.visible && contextMenu.menu.type && contextMenu.menu.targetId && (
        <ContextMenu
          x={contextMenu.menu.x}
          y={contextMenu.menu.y}
          type={contextMenu.menu.type}
          targetId={contextMenu.menu.targetId}
          onClose={contextMenu.hideMenu}
          onOpen={handleOpenItem}
          onRename={handleRenameItem}
          onMove={handleMoveItem}
          onToggleFavorite={(id) => {
            const file = vault.allFiles.find((f) => f.id === id);
            if (file) vault.setFavorite(id, !file.favorite);
          }}
          onAddTag={(id) => setTagEditingFileId(id)}
          onDelete={handleDeleteItem}
        />
      )}

      {/* Tag Editor modal overlay */}
      {tagEditingFileId && (
        <TagEditor
          file={vault.allFiles.find((f) => f.id === tagEditingFileId)!}
          onClose={() => setTagEditingFileId(null)}
          onLinkTag={akira.linkTagToFile}
          onUnlinkTag={akira.unlinkTagFromFile}
        />
      )}

      {/* Floating Upload queue */}
      {isQueueOpen && (
        <UploadQueue
          queue={uploadQueue.queue}
          onRetry={uploadQueue.retryUpload}
          onCancel={uploadQueue.cancelUpload}
          onClose={() => setIsQueueOpen(false)}
        />
      )}
    </>
  );
}
