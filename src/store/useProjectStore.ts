import { create } from 'zustand';
import type { ColumnDef, Depot, Project, Route, Stop } from '@/types';

interface ProjectState {
  project: Project | null;

  initProject: (name: string) => void;
  setProject: (p: Project) => void;
  resetProject: () => void;

  // Schema + label template
  setColumnSchema: (schema: ColumnDef[]) => void;
  setLabelTemplate: (template: string) => void;

  // Stops
  setStops: (stops: Stop[]) => void;
  upsertStop: (stop: Stop) => void;
  removeStop: (stopId: string) => void;

  // Depots
  addDepot: (depot: Depot) => void;
  updateDepot: (id: string, patch: Partial<Omit<Depot, 'id'>>) => void;
  removeDepot: (id: string) => void;

  // Routes
  addRoute: (route: Route) => void;
  updateRoute: (id: string, patch: Partial<Omit<Route, 'id'>>) => void;
  removeRoute: (id: string) => void;

  // Stop ↔ Route assignment (multi-membership: a stop can belong to many routes)
  toggleStopInRoute: (routeId: string, stopId: string) => void;
  addStopToRoute: (routeId: string, stopId: string) => void;
  removeStopFromRoute: (routeId: string, stopId: string) => void;
  reorderRouteStops: (routeId: string, stopIds: string[]) => void;
}

const newProject = (name: string): Project => ({
  id: `proj-${Date.now()}`,
  name,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  settings: { default_loop: false },
  column_schema: [],
  label_template: '',
  stops: [],
  depots: [],
  routes: [],
});

const touch = (p: Project): Project => ({ ...p, updated_at: new Date().toISOString() });

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,

  initProject: (name) => set({ project: newProject(name) }),
  setProject: (project) => set({ project }),
  resetProject: () => set({ project: null }),

  setColumnSchema: (column_schema) =>
    set((s) => (s.project ? { project: touch({ ...s.project, column_schema }) } : s)),

  setLabelTemplate: (label_template) =>
    set((s) => (s.project ? { project: touch({ ...s.project, label_template }) } : s)),

  setStops: (stops) =>
    set((s) => (s.project ? { project: touch({ ...s.project, stops }) } : s)),

  upsertStop: (stop) =>
    set((s) => {
      if (!s.project) return s;
      const idx = s.project.stops.findIndex((x) => x.id === stop.id);
      const stops =
        idx >= 0
          ? s.project.stops.map((x, i) => (i === idx ? stop : x))
          : [...s.project.stops, stop];
      return { project: touch({ ...s.project, stops }) };
    }),

  removeStop: (stopId) =>
    set((s) => {
      if (!s.project) return s;
      const stops = s.project.stops.filter((x) => x.id !== stopId);
      const routes = s.project.routes.map((r) => ({
        ...r,
        stop_ids: r.stop_ids.filter((id) => id !== stopId),
      }));
      return { project: touch({ ...s.project, stops, routes }) };
    }),

  addDepot: (depot) =>
    set((s) =>
      s.project
        ? { project: touch({ ...s.project, depots: [...s.project.depots, depot] }) }
        : s,
    ),

  updateDepot: (id, patch) =>
    set((s) =>
      s.project
        ? {
            project: touch({
              ...s.project,
              depots: s.project.depots.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }),
          }
        : s,
    ),

  removeDepot: (id) =>
    set((s) => {
      if (!s.project) return s;
      const depots = s.project.depots.filter((d) => d.id !== id);
      const routes = s.project.routes.map((r) => ({
        ...r,
        start_depot_id: r.start_depot_id === id ? undefined : r.start_depot_id,
        end_depot_id: r.end_depot_id === id ? undefined : r.end_depot_id,
      }));
      return { project: touch({ ...s.project, depots, routes }) };
    }),

  addRoute: (route) =>
    set((s) =>
      s.project
        ? { project: touch({ ...s.project, routes: [...s.project.routes, route] }) }
        : s,
    ),

  updateRoute: (id, patch) =>
    set((s) =>
      s.project
        ? {
            project: touch({
              ...s.project,
              routes: s.project.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)),
            }),
          }
        : s,
    ),

  removeRoute: (id) =>
    set((s) => {
      if (!s.project) return s;
      const routes = s.project.routes.filter((r) => r.id !== id);
      return { project: touch({ ...s.project, routes }) };
    }),

  toggleStopInRoute: (routeId, stopId) =>
    set((s) => {
      if (!s.project) return s;
      const routes = s.project.routes.map((r) => {
        if (r.id !== routeId) return r;
        const has = r.stop_ids.includes(stopId);
        return {
          ...r,
          stop_ids: has
            ? r.stop_ids.filter((id) => id !== stopId)
            : [...r.stop_ids, stopId],
        };
      });
      return { project: touch({ ...s.project, routes }) };
    }),

  addStopToRoute: (routeId, stopId) =>
    set((s) => {
      if (!s.project) return s;
      const routes = s.project.routes.map((r) =>
        r.id !== routeId || r.stop_ids.includes(stopId)
          ? r
          : { ...r, stop_ids: [...r.stop_ids, stopId] },
      );
      return { project: touch({ ...s.project, routes }) };
    }),

  removeStopFromRoute: (routeId, stopId) =>
    set((s) => {
      if (!s.project) return s;
      const routes = s.project.routes.map((r) =>
        r.id !== routeId
          ? r
          : { ...r, stop_ids: r.stop_ids.filter((id) => id !== stopId) },
      );
      return { project: touch({ ...s.project, routes }) };
    }),

  reorderRouteStops: (routeId, stop_ids) =>
    set((s) =>
      s.project
        ? {
            project: touch({
              ...s.project,
              routes: s.project.routes.map((r) =>
                r.id === routeId ? { ...r, stop_ids } : r,
              ),
            }),
          }
        : s,
    ),
}));
