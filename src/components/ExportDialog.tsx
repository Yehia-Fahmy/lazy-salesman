import { useMemo, useState } from 'react';
import {
  buildGoogleMapsLinks,
  buildPlainText,
  collectRoutePoints,
  safeFileName,
} from '@/lib/googleMapsExport';
import { downloadProjectZip, downloadTextFile } from '@/lib/zip';
import type { Project, ThemeTokens } from '@/types';

interface ExportDialogProps {
  theme: ThemeTokens;
  project: Project;
  onClose: () => void;
}

export function ExportDialog({ theme, project, onClose }: ExportDialogProps) {
  const [busy, setBusy] = useState(false);
  const routesWithLinks = useMemo(
    () =>
      project.routes.map((route) => {
        const points = collectRoutePoints(
          route,
          project.stops,
          project.depots,
          project.label_template,
        );
        const links = buildGoogleMapsLinks(points);
        return { route, points, links };
      }),
    [project],
  );

  const totalRoutes = project.routes.length;
  const usableRoutes = routesWithLinks.filter((r) => r.points.length >= 2).length;

  const downloadAll = async () => {
    setBusy(true);
    try {
      await downloadProjectZip(project);
    } finally {
      setBusy(false);
    }
  };

  const openAllLinks = (links: { url: string }[]) => {
    links.forEach((l) => window.open(l.url, '_blank', 'noopener,noreferrer'));
  };

  const downloadRouteTxt = (routeName: string, text: string) => {
    downloadTextFile(`${safeFileName(routeName)}.txt`, text);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          background: theme.chrome,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          width: 640,
          maxHeight: '88vh',
          boxShadow: '0 20px 60px rgba(0,0,0,.15)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}` }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>
              Export routes
            </div>
            <div style={{ fontSize: 12, color: theme.textTertiary, marginTop: 2 }}>
              {usableRoutes} of {totalRoutes} route{totalRoutes === 1 ? '' : 's'} have stops
              to export
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              color: theme.textTertiary,
              fontSize: 20,
            }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '16px 24px' }}>
          {totalRoutes === 0 && (
            <div style={{ fontSize: 13, color: theme.textSecondary }}>
              No routes yet. Create a route first.
            </div>
          )}
          {routesWithLinks.map(({ route, points, links }) => {
            const usable = points.length >= 2;
            const split = links.length > 1;
            return (
              <div
                key={route.id}
                style={{
                  padding: 12,
                  marginBottom: 10,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  background: theme.inputBg,
                }}
              >
                <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: route.color,
                    }}
                  />
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary }}
                  >
                    {route.name}
                  </span>
                  <span
                    className="ml-auto tabular"
                    style={{ fontSize: 12, color: theme.textTertiary }}
                  >
                    {points.length} point{points.length === 1 ? '' : 's'}
                  </span>
                </div>
                {!usable ? (
                  <div style={{ fontSize: 12, color: theme.textTertiary }}>
                    Not enough points to export — add stops or pick depots.
                  </div>
                ) : (
                  <>
                    {split && (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#9A3412',
                          background: '#FFF7ED',
                          border: '1px solid #FED7AA',
                          padding: '4px 8px',
                          borderRadius: 4,
                          display: 'inline-block',
                          marginBottom: 8,
                        }}
                      >
                        Split into {links.length} parts (Google Maps allows max 10 points
                        per URL)
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openAllLinks(links)}
                        style={primaryBtn(theme)}
                      >
                        Open in Google Maps
                        {split ? ` (${links.length} tabs)` : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadRouteTxt(route.name, buildPlainText(route.name, points, links))
                        }
                        style={secondaryBtn(theme)}
                      >
                        Download .txt
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="flex items-center justify-between"
          style={{ padding: '14px 24px', borderTop: `1px solid ${theme.border}` }}
        >
          <div style={{ fontSize: 12, color: theme.textTertiary }}>
            ZIP includes a per-route plain-text list and the Google Maps URLs.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={secondaryBtn(theme)}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void downloadAll()}
              disabled={busy || usableRoutes === 0}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: theme.accent,
                border: 'none',
                borderRadius: 6,
                cursor: busy || usableRoutes === 0 ? 'not-allowed' : 'pointer',
                opacity: busy || usableRoutes === 0 ? 0.6 : 1,
              }}
            >
              {busy ? 'Bundling…' : 'Download all (ZIP)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function primaryBtn(theme: ThemeTokens): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    color: '#fff',
    background: theme.accent,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  };
}

function secondaryBtn(theme: ThemeTokens): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    color: theme.textPrimary,
    background: theme.inputBg,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    cursor: 'pointer',
  };
}
