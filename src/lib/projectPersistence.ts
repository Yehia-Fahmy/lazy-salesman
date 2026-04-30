import { useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { useProjectStore } from '@/store/useProjectStore';
import type { Project } from '@/types';

const LAST_PROJECT_KEY = 'lazysalesman.last_project_id';

const readLastProjectId = (): string | null => {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
};

const writeLastProjectId = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(LAST_PROJECT_KEY, id);
    else window.localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    /* noop */
  }
};

export async function loadInitialProject(): Promise<Project | null> {
  const id = readLastProjectId();
  if (id) {
    const p = await db.projects.get(id);
    if (p) return p;
  }
  // Fall back to most-recently-updated project
  const all = await db.projects.toArray();
  if (all.length === 0) return null;
  return all.reduce((best, cur) =>
    new Date(cur.updated_at) > new Date(best.updated_at) ? cur : best,
  );
}

const SAVE_DEBOUNCE_MS = 400;

/** Hook: hydrate from IDB on mount, debounce-persist on every project change. */
export function useProjectPersistence(): { hydrated: boolean } {
  const setProject = useProjectStore((s) => s.setProject);
  const project = useProjectStore((s) => s.project);
  const hydratedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Hydrate once
  useEffect(() => {
    let cancelled = false;
    void loadInitialProject().then((p) => {
      if (cancelled) return;
      if (p) setProject(p);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [setProject]);

  // Debounced save on project changes
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!project) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void db.projects.put(project);
      writeLastProjectId(project.id);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [project]);

  return { hydrated: hydratedRef.current };
}

export async function deleteProjectFromDb(id: string): Promise<void> {
  await db.projects.delete(id);
  if (readLastProjectId() === id) writeLastProjectId(null);
}

/** Resets the in-memory project AND removes it from IDB. Keeps the geocode
 *  cache and import templates intact so future re-imports are still fast. */
export async function resetCurrentProject(): Promise<void> {
  const id = useProjectStore.getState().project?.id;
  useProjectStore.getState().resetProject();
  writeLastProjectId(null);
  if (id) await db.projects.delete(id);
}
