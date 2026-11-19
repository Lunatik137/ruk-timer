import type { VideoMarkOrigins, VideoMarks, VideoSolveContext } from "./videoAnalysis";

export interface VideoDraft {
  file: File;
  context: VideoSolveContext;
  marks: VideoMarks;
  origins: VideoMarkOrigins;
  startedAt: number;
}

async function withDraftStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ruktimer-video-analyzer", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("drafts", mode);
      const request = operation(transaction.objectStore("drafts"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function loadVideoDraft(): Promise<VideoDraft | undefined> {
  return withDraftStore("readonly", (store) => store.get("current"));
}

export async function saveVideoDraft(draft: VideoDraft | null): Promise<void> {
  if (draft) {
    await withDraftStore("readwrite", (store) => store.put(draft, "current"));
  } else {
    await withDraftStore("readwrite", (store) => store.delete("current"));
  }
}
