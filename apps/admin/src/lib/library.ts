import type { LibraryFolder } from "@showroom/contracts";

export const ROOT_FOLDER_ID = "__root__";

export function sortFolders(folders: LibraryFolder[]) {
  return [...folders].sort((a, b) => {
    const parentDiff = (a.parentId ?? "").localeCompare(b.parentId ?? "");
    if (parentDiff !== 0) {
      return parentDiff;
    }

    const orderDiff = a.order - b.order;
    if (orderDiff !== 0) {
      return orderDiff;
    }

    return a.name.localeCompare(b.name);
  });
}

export function getFolderMap(folders: LibraryFolder[]) {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

export function getFolderChildren(folders: LibraryFolder[], parentId: string | null) {
  return sortFolders(
    folders.filter((folder) => (folder.parentId ?? null) === parentId),
  );
}

export function getFolderDepth(folderId: string | null, folderMap: Map<string, LibraryFolder>) {
  let depth = 0;
  let currentId = folderId;

  while (currentId) {
    const current = folderMap.get(currentId);
    if (!current?.parentId) {
      break;
    }

    currentId = current.parentId;
    depth += 1;
  }

  return depth;
}

export function getFolderTrail(folderId: string | null, folderMap: Map<string, LibraryFolder>) {
  const trail: LibraryFolder[] = [];
  let currentId = folderId;

  while (currentId) {
    const current = folderMap.get(currentId);
    if (!current) {
      break;
    }

    trail.unshift(current);
    currentId = current.parentId ?? null;
  }

  return trail;
}

export function getFolderName(folderId: string | null, folderMap: Map<string, LibraryFolder>) {
  if (!folderId) {
    return "Root";
  }

  return folderMap.get(folderId)?.name ?? "Root";
}

export function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (!item) {
    return items;
  }

  next.splice(toIndex, 0, item);
  return next;
}
