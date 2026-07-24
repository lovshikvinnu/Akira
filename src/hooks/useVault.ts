import { useSearch, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useAkira, akira } from "../akira-os";
import { VaultFile, VaultFolder } from "../shared/types/store-types";

export function useVault() {
  const search = useSearch({ strict: false }) as any;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const folderId = search.folderId || null;
  const viewMode = search.view || "grid";
  const sortField = search.sort || "name";
  const sortDir = search.dir || "asc";
  const showFavorites = !!search.favorites;
  const showDeleted = !!search.deleted;
  const filterTag = search.tag || null;

  const vaultFolders = useAkira((s) => s.vaultFolders || []);
  const vaultFiles = useAkira((s) => s.vaultFiles || []);

  // 1. Resolve Active Folder
  const activeFolder = useMemo(() => {
    if (!folderId) return null;
    return vaultFolders.find((f) => f.id === folderId) || null;
  }, [folderId, vaultFolders]);

  // 2. Resolve Breadcrumbs Trail
  const breadcrumbs = useMemo(() => {
    if (showDeleted) return [{ id: "trash", name: "Trash" }];
    if (showFavorites) return [{ id: "favorites", name: "Favorites" }];
    if (filterTag) return [{ id: `tag:${filterTag}`, name: `Tag: ${filterTag}` }];

    const trail: Array<{ id: string | null; name: string }> = [{ id: null, name: "Vault" }];
    if (!folderId) return trail;

    const pathChain: VaultFolder[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = vaultFolders.find((f) => f.id === currentId);
      if (folder) {
        pathChain.unshift(folder);
        currentId = folder.parentId;
      } else {
        currentId = null;
      }
    }

    pathChain.forEach((f) => {
      trail.push({ id: f.id, name: f.name });
    });

    return trail;
  }, [folderId, vaultFolders, showDeleted, showFavorites, filterTag]);

  // 3. Filtering Logic
  const filteredFolders = useMemo(() => {
    // Folders are only rendered when browsing active directories (not in Trash, Favorites, or Tag views)
    if (showDeleted || showFavorites || filterTag) return [];
    return vaultFolders.filter((f) => f.parentId === folderId);
  }, [vaultFolders, folderId, showDeleted, showFavorites, filterTag]);

  const filteredFiles = useMemo(() => {
    if (showDeleted) {
      return vaultFiles.filter((f) => f.deletedAt !== null);
    }
    if (showFavorites) {
      return vaultFiles.filter((f) => f.favorite && f.deletedAt === null);
    }
    if (filterTag) {
      return vaultFiles.filter((f) => f.deletedAt === null && f.tags?.includes(filterTag));
    }
    return vaultFiles.filter((f) => f.folderId === folderId && f.deletedAt === null);
  }, [vaultFiles, folderId, showDeleted, showFavorites, filterTag]);

  // 4. Sorting Logic
  const sortedFolders = useMemo(() => {
    const sorted = [...filteredFolders];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (sortField === "createdAt" || sortField === "updatedAt") {
        const dateA = new Date(a[sortField as "createdAt" | "updatedAt"]).getTime();
        const dateB = new Date(b[sortField as "createdAt" | "updatedAt"]).getTime();
        comparison = dateA - dateB;
      } else {
        comparison = a.name.localeCompare(b.name);
      }
      return sortDir === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredFolders, sortField, sortDir]);

  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = a.displayName.localeCompare(b.displayName);
      } else if (sortField === "createdAt" || sortField === "updatedAt") {
        const dateA = a[sortField as "createdAt" | "updatedAt"]
          ? new Date(a[sortField as "createdAt" | "updatedAt"]!).getTime()
          : 0;
        const dateB = b[sortField as "createdAt" | "updatedAt"]
          ? new Date(b[sortField as "createdAt" | "updatedAt"]!).getTime()
          : 0;
        comparison = dateA - dateB;
      } else if (sortField === "size") {
        comparison = a.sizeBytes - b.sizeBytes;
      } else if (sortField === "type") {
        comparison = a.mimeType.localeCompare(b.mimeType);
      }
      return sortDir === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredFiles, sortField, sortDir]);

  // 5. Navigation Actions
  const navigateToFolder = useCallback(
    (id: string | null) => {
      navigate({
        to: pathname,
        search: (prev: any) => ({
          ...prev,
          folderId: id,
          favorites: undefined,
          deleted: undefined,
          tag: undefined,
        }),
      });
    },
    [navigate, pathname],
  );

  const toggleViewMode = useCallback(() => {
    navigate({
      to: pathname,
      search: (prev: any) => ({
        ...prev,
        view: prev.view === "list" ? "grid" : "list",
      }),
    });
  }, [navigate, pathname]);

  const setSort = useCallback(
    (field: string, direction: "asc" | "desc") => {
      navigate({
        to: pathname,
        search: (prev: any) => ({
          ...prev,
          sort: field,
          dir: direction,
        }),
      });
    },
    [navigate, pathname],
  );

  const navigateToFavorites = useCallback(() => {
    navigate({
      to: pathname,
      search: (prev: any) => ({
        ...prev,
        folderId: undefined,
        favorites: true,
        deleted: undefined,
        tag: undefined,
      }),
    });
  }, [navigate, pathname]);

  const navigateToTrash = useCallback(() => {
    navigate({
      to: pathname,
      search: (prev: any) => ({
        ...prev,
        folderId: undefined,
        favorites: undefined,
        deleted: true,
        tag: undefined,
      }),
    });
  }, [navigate, pathname]);

  const filterByTag = useCallback(
    (tag: string | null) => {
      navigate({
        to: pathname,
        search: (prev: any) => ({
          ...prev,
          folderId: undefined,
          favorites: undefined,
          deleted: undefined,
          tag: tag || undefined,
        }),
      });
    },
    [navigate, pathname],
  );

  // 6. Optimistic store operations mapping
  const addFolder = useCallback(
    (name: string) => {
      return akira.addFolder(name, folderId);
    },
    [folderId],
  );

  const renameFolder = useCallback((id: string, name: string) => {
    akira.renameFolder(id, name);
  }, []);

  const moveFolder = useCallback((id: string, parentId: string | null) => {
    akira.moveFolder(id, parentId);
  }, []);

  const deleteFolder = useCallback((id: string) => {
    akira.deleteFolder(id);
  }, []);

  const renameFile = useCallback((id: string, name: string) => {
    akira.renameFile(id, name);
  }, []);

  const moveFile = useCallback((id: string, targetFolderId: string | null) => {
    akira.moveFile(id, targetFolderId);
  }, []);

  const deleteFile = useCallback((id: string) => {
    akira.deleteFile(id);
  }, []);

  const restoreFile = useCallback((id: string) => {
    akira.restoreFile(id);
  }, []);

  const permanentDeleteFile = useCallback((id: string) => {
    akira.permanentDeleteFile(id);
  }, []);

  const setFavorite = useCallback((id: string, favorite: boolean) => {
    akira.setFavorite(id, favorite);
  }, []);

  return {
    folderId,
    viewMode,
    sortField,
    sortDir,
    showFavorites,
    showDeleted,
    filterTag,
    activeFolder,
    breadcrumbs,
    folders: sortedFolders,
    files: sortedFiles,
    allFolders: vaultFolders,
    allFiles: vaultFiles,

    // Navigation triggers
    navigateToFolder,
    toggleViewMode,
    setSort,
    navigateToFavorites,
    navigateToTrash,
    filterByTag,

    // Mutator actions
    addFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    renameFile,
    moveFile,
    deleteFile,
    restoreFile,
    permanentDeleteFile,
    setFavorite,
  };
}
