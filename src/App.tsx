import { useMemo, useRef, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { MapView } from '@/components/MapView';
import { Settings } from '@/components/Settings';
import { Sidebar, Divider } from '@/components/Sidebar';
import { NoCsvCenterCard, NoToken } from '@/components/EmptyStates';
import { ImportWizard } from '@/components/ImportWizard';
import { PinPopup } from '@/components/PinPopup';
import { UnassignedStopsList } from '@/components/UnassignedStopsList';
import { NeedsAttentionPanel } from '@/components/NeedsAttentionPanel';
import { FilterPanel } from '@/components/FilterPanel';
import { RoutePanel } from '@/components/RoutePanel';
import { DepotEditor } from '@/components/DepotEditor';
import { ExportDialog } from '@/components/ExportDialog';
import { StopEditor } from '@/components/StopEditor';
import { THEMES, ROUTE_PALETTE } from '@/theme';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useProjectPersistence } from '@/lib/projectPersistence';
import { useActiveRouteEta, useAllRoutesEta } from '@/lib/useRouteEta';
import { resetCurrentProject } from '@/lib/projectPersistence';
import type { Route } from '@/types';

export function App() {
  const themeName = useUIStore((s) => s.theme);
  const theme = useMemo(() => THEMES[themeName], [themeName]);

  const mapboxToken = useUIStore((s) => s.mapboxToken);
  const setMapboxToken = useUIStore((s) => s.setMapboxToken);
  const setTheme = useUIStore((s) => s.setTheme);
  const showSettings = useUIStore((s) => s.showSettings);
  const setShowSettings = useUIStore((s) => s.setShowSettings);
  const showWizard = useUIStore((s) => s.showWizard);
  const setShowWizard = useUIStore((s) => s.setShowWizard);
  const activeRouteId = useUIStore((s) => s.activeRouteId);
  const setActiveRouteId = useUIStore((s) => s.setActiveRouteId);
  const openPopupStopId = useUIStore((s) => s.openPopupStopId);
  const setOpenPopupStopId = useUIStore((s) => s.setOpenPopupStopId);
  const visibleRoutes = useUIStore((s) => s.visibleRoutes);
  const toggleRouteVisibility = useUIStore((s) => s.toggleRouteVisibility);
  const setVisibleRoutes = useUIStore((s) => s.setVisibleRoutes);

  const project = useProjectStore((s) => s.project);
  const toggleStopInRoute = useProjectStore((s) => s.toggleStopInRoute);
  const addRoute = useProjectStore((s) => s.addRoute);
  const updateRoute = useProjectStore((s) => s.updateRoute);
  const removeRoute = useProjectStore((s) => s.removeRoute);
  const reorderRouteStops = useProjectStore((s) => s.reorderRouteStops);
  const removeDepot = useProjectStore((s) => s.removeDepot);
  const removeStop = useProjectStore((s) => s.removeStop);

  const handleDeleteStop = (stopId: string) => {
    if (openPopupStopId === stopId) setOpenPopupStopId(null);
    removeStop(stopId);
  };

  const handleResetAll = () => {
    if (!project) return;
    const counts = `${project.stops.length} stop${project.stops.length === 1 ? '' : 's'}, ${project.depots.length} depot${project.depots.length === 1 ? '' : 's'}, ${project.routes.length} route${project.routes.length === 1 ? '' : 's'}`;
    if (!confirm(`Clear ALL data? This permanently deletes ${counts} for the current project.`)) return;
    void resetCurrentProject().then(() => {
      setActiveRouteId(null);
      setOpenPopupStopId(null);
      setVisibleRoutes(new Set(['unassigned']));
    });
  };

  useProjectPersistence();
  useActiveRouteEta();
  useAllRoutesEta();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showDepotEditor, setShowDepotEditor] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);

  const handleEditStop = (stopId: string) => {
    setOpenPopupStopId(null);
    setEditingStopId(stopId);
  };

  const handleFixStop = (stopId: string) => {
    const stop = project?.stops.find((s) => s.id === stopId);
    if (stop) {
      window.dispatchEvent(
        new CustomEvent('ls:panTo', { detail: { lat: stop.lat, lng: stop.lng } }),
      );
    }
    setOpenPopupStopId(null);
    setEditingStopId(stopId);
  };
  const editingStop = editingStopId
    ? project?.stops.find((s) => s.id === editingStopId) ?? null
    : null;

  const [pendingMapPoint, setPendingMapPoint] = useState<
    { lat: number; lng: number } | null
  >(null);

  const hasToken = mapboxToken.trim().length > 0;
  const stops = project?.stops ?? [];
  const routes = project?.routes ?? [];
  const depots = project?.depots ?? [];
  const labelTemplate = project?.label_template ?? '';
  const schema = project?.column_schema ?? [];
  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;
  const popupStop = openPopupStopId ? stops.find((s) => s.id === openPopupStopId) ?? null : null;

  const handleImportClick = () => {
    if (!hasToken) {
      setShowSettings(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setShowWizard(true);
    }
    e.target.value = '';
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    setPendingFile(null);
  };

  const handlePinClick = (stopId: string) => {
    if (placementMode) return;
    if (activeRouteId) {
      toggleStopInRoute(activeRouteId, stopId);
    } else {
      setOpenPopupStopId(openPopupStopId === stopId ? null : stopId);
    }
  };

  const handleAddToActiveRoute = (stopId: string) => {
    if (!activeRouteId) return;
    toggleStopInRoute(activeRouteId, stopId);
    setOpenPopupStopId(null);
  };

  const handleSidebarStopClick = (stopId: string) => {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return;
    setOpenPopupStopId(stopId);
    window.dispatchEvent(
      new CustomEvent('ls:panTo', { detail: { lat: stop.lat, lng: stop.lng } }),
    );
  };

  const handleAddRoute = () => {
    if (!project) return;
    const id = `route-${Date.now()}`;
    const fallbackColor = ROUTE_PALETTE[routes.length % ROUTE_PALETTE.length] ?? '#2563EB';
    const newRoute: Route = {
      id,
      name: `Route ${routes.length + 1}`,
      color: fallbackColor,
      stop_ids: [],
      is_loop: false,
      total_minutes: 0,
      total_km: 0,
    };
    if (depots[0]) {
      newRoute.start_depot_id = depots[0].id;
      newRoute.end_depot_id = depots[0].id;
    }
    addRoute(newRoute);
    setVisibleRoutes(new Set([...visibleRoutes, id]));
    setActiveRouteId(id);
  };

  const handleEditRoute = (id: string) => {
    setActiveRouteId(id);
    setOpenPopupStopId(null);
  };

  const handleDeleteRoute = () => {
    if (!activeRoute) return;
    if (!confirm(`Delete route "${activeRoute.name}"?`)) return;
    const id = activeRoute.id;
    removeRoute(id);
    setActiveRouteId(null);
    const next = new Set(visibleRoutes);
    next.delete(id);
    setVisibleRoutes(next);
  };

  const handleDeleteDepot = (id: string) => {
    const depot = depots.find((d) => d.id === id);
    if (!depot) return;
    const usedBy = routes.filter(
      (r) => r.start_depot_id === id || r.end_depot_id === id,
    );
    const msg =
      usedBy.length > 0
        ? `Delete depot "${depot.label}"? It is referenced by ${usedBy.length} route${usedBy.length === 1 ? '' : 's'} and will be cleared from those.`
        : `Delete depot "${depot.label}"?`;
    if (!confirm(msg)) return;
    removeDepot(id);
  };

  const handleAddDepotClick = () => {
    if (!hasToken) {
      setShowSettings(true);
      return;
    }
    setPendingMapPoint(null);
    setPlacementMode(false);
    setShowDepotEditor(true);
  };

  const handleRequestMapPlacement = () => {
    setPlacementMode(true);
  };

  const handleMapPlace = (point: { lat: number; lng: number }) => {
    setPendingMapPoint(point);
    setPlacementMode(false);
    setShowDepotEditor(true);
  };

  const handleDepotEditorClose = () => {
    setShowDepotEditor(false);
  };

  const handleClearMapPoint = () => {
    setPendingMapPoint(null);
  };

  return (
    <div
      className="w-screen h-screen flex flex-col font-sans overflow-hidden"
      style={{ background: theme.chrome, color: theme.textPrimary, fontSize: 14 }}
    >
      <TopBar
        theme={theme}
        projectName={project?.name ?? 'Lazy Salesman'}
        onImport={handleImportClick}
        onExport={() => project && setShowExport(true)}
        onSettings={() => setShowSettings(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative min-w-0">
          <MapView
            theme={theme}
            stops={stops}
            routes={routes}
            depots={depots}
            visibleRoutes={visibleRoutes}
            activeRoute={activeRoute}
            popupStopId={openPopupStopId}
            placementMode={placementMode}
            onPinClick={handlePinClick}
            onMapClick={() => {
              if (placementMode) return;
              setOpenPopupStopId(null);
            }}
            onPlacePoint={handleMapPlace}
          />

          {placementMode && (
            <div
              className="absolute"
              style={{
                top: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#18181B',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 500,
                zIndex: 600,
                boxShadow: '0 4px 12px rgba(0,0,0,.2)',
              }}
            >
              Click anywhere on the map to place a depot
              <button
                type="button"
                onClick={() => setPlacementMode(false)}
                style={{
                  marginLeft: 12,
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {stops.length === 0 &&
            depots.length === 0 &&
            !placementMode &&
            !showSettings &&
            !showWizard &&
            !showDepotEditor &&
            !showExport && (
              <NoCsvCenterCard
                theme={theme}
                blocked={!hasToken}
                onImport={handleImportClick}
              />
            )}

          {popupStop && !activeRouteId && !placementMode && (
            <div
              className="absolute"
              style={{
                top: 80,
                left: '50%',
                transform: 'translateX(-60%)',
                zIndex: 500,
              }}
            >
              <PinPopup
                theme={theme}
                stop={popupStop}
                schema={schema}
                labelTemplate={labelTemplate}
                routes={routes}
                activeRouteId={activeRouteId}
                onToggleRouteMembership={(routeId, stopId) =>
                  toggleStopInRoute(routeId, stopId)
                }
                onAddToActiveRoute={handleAddToActiveRoute}
                onDeleteStop={handleDeleteStop}
                onEditStop={handleEditStop}
                onClose={() => setOpenPopupStopId(null)}
              />
            </div>
          )}

          {activeRouteId && (
            <div
              className="absolute"
              style={{
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#18181B',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 500,
                zIndex: 400,
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,.2)',
              }}
            >
              Click pins to add/remove ·{' '}
              {activeRoute?.stop_ids.length ?? 0} stop
              {activeRoute?.stop_ids.length === 1 ? '' : 's'}
            </div>
          )}
        </div>

        <Sidebar theme={theme} width={320}>
          {!hasToken ? (
            <div style={{ padding: '12px 0' }}>
              <NoToken
                theme={theme}
                onOpenSettings={() => setShowSettings(true)}
                message="Add a Mapbox token to enable CSV import and route ETA calculation."
              />
            </div>
          ) : (
            <>
              <NeedsAttentionPanel
                theme={theme}
                stops={stops}
                labelTemplate={labelTemplate}
                onFixStop={handleFixStop}
                onDeleteStop={handleDeleteStop}
              />
              {stops.some((s) => s.needs_attention) && <Divider theme={theme} />}

              <FilterPanel
                theme={theme}
                routes={routes}
                stops={stops}
                depots={depots}
                visibleRoutes={visibleRoutes}
                onToggleRoute={toggleRouteVisibility}
                onAddRoute={handleAddRoute}
                onAddDepot={handleAddDepotClick}
                onEditRoute={handleEditRoute}
                onDeleteDepot={handleDeleteDepot}
              />
              <Divider theme={theme} />

              {activeRoute ? (
                <RoutePanel
                  theme={theme}
                  route={activeRoute}
                  stops={stops}
                  depots={depots}
                  labelTemplate={labelTemplate}
                  onRename={(name) => updateRoute(activeRoute.id, { name })}
                  onChangeStartDepot={(id) =>
                    updateRoute(activeRoute.id, { start_depot_id: id })
                  }
                  onChangeEndDepot={(id) =>
                    updateRoute(activeRoute.id, { end_depot_id: id })
                  }
                  onToggleLoop={() =>
                    updateRoute(activeRoute.id, { is_loop: !activeRoute.is_loop })
                  }
                  onReorder={(stop_ids) => reorderRouteStops(activeRoute.id, stop_ids)}
                  onRemoveStop={(stopId) => toggleStopInRoute(activeRoute.id, stopId)}
                  onStopClick={handleSidebarStopClick}
                  onDone={() => setActiveRouteId(null)}
                  onDelete={handleDeleteRoute}
                />
              ) : (
                stops.length > 0 && (
                  <UnassignedStopsList
                    theme={theme}
                    stops={stops}
                    routes={routes}
                    labelTemplate={labelTemplate}
                    onStopClick={handleSidebarStopClick}
                    onDeleteStop={handleDeleteStop}
                  />
                )
              )}

              {(stops.length > 0 || depots.length > 0 || routes.length > 0) && (
                <>
                  <Divider theme={theme} />
                  <div style={{ padding: '10px 16px 14px' }}>
                    <button
                      type="button"
                      onClick={handleResetAll}
                      style={{
                        width: '100%',
                        padding: '8px 0',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#DC2626',
                        background: 'transparent',
                        border: '1px solid #FCA5A5',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      Clear all (stops, depots, routes)
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </Sidebar>
      </div>

      {showSettings && (
        <Settings
          theme={theme}
          themeName={themeName}
          token={mapboxToken}
          onTokenChange={setMapboxToken}
          onThemeChange={setTheme}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showWizard && pendingFile && (
        <ImportWizard
          theme={theme}
          file={pendingFile}
          token={mapboxToken}
          onClose={handleWizardClose}
        />
      )}

      {showDepotEditor && (
        <DepotEditor
          theme={theme}
          token={mapboxToken}
          onClose={handleDepotEditorClose}
          onRequestMapPlacement={handleRequestMapPlacement}
          pendingMapPoint={pendingMapPoint}
          onClearMapPoint={handleClearMapPoint}
        />
      )}

      {showExport && project && (
        <ExportDialog
          theme={theme}
          project={project}
          onClose={() => setShowExport(false)}
        />
      )}

      {editingStop && (
        <StopEditor
          theme={theme}
          stop={editingStop}
          schema={schema}
          labelTemplate={labelTemplate}
          token={mapboxToken}
          onClose={() => setEditingStopId(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChosen}
        style={{ display: 'none' }}
      />
    </div>
  );
}
