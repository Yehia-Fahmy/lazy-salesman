import { useEffect, useMemo, useState } from 'react';
import {
  buildGoogleMapsLinks,
  buildPlainText,
  collectRoutePoints,
  safeFileName,
} from '@/lib/googleMapsExport';
import {
  buildPdfColumnOptions,
  buildRouteStopRows,
  defaultSelectedPdfColumns,
  resolvePdfCellValue,
} from '@/lib/exportRouteData';
import { exportRoutePdf } from '@/lib/pdfRouteExport';
import { downloadProjectZip, downloadTextFile } from '@/lib/zip';
import { RouteShareModal } from '@/components/RouteShareModal';
import type { Project, ThemeTokens } from '@/types';

interface ExportDialogProps {
  theme: ThemeTokens;
  project: Project;
  onClose: () => void;
}

export function ExportDialog({ theme, project, onClose }: ExportDialogProps) {
  const [busy, setBusy] = useState(false);
  const [copyStatusByRoute, setCopyStatusByRoute] = useState<Record<string, 'idle' | 'copied' | 'failed'>>({});
  const [shareRoute, setShareRoute] = useState<{ routeName: string; url: string } | null>(null);
  const pdfColumnOptions = useMemo(() => buildPdfColumnOptions(project), [project]);
  const [selectedPdfColumnIds, setSelectedPdfColumnIds] = useState<string[]>(() =>
    defaultSelectedPdfColumns(pdfColumnOptions),
  );

  useEffect(() => {
    setSelectedPdfColumnIds((prev) => {
      const available = new Set(pdfColumnOptions.map((option) => option.id));
      const filtered = prev.filter((id) => available.has(id));
      if (filtered.length > 0) return filtered;
      return defaultSelectedPdfColumns(pdfColumnOptions);
    });
  }, [pdfColumnOptions]);

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
        const stopRows = buildRouteStopRows(project, route);
        return { route, points, links, stopRows };
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

  // Trigger one PDF download per route that has stops. We validate the column
  // selection and the existence of routes with stops up-front (rather than per
  // route inside the loop) so the user only sees a single alert and never gets
  // a half-completed batch.
  const exportAllAsPdf = async () => {
    if (selectedPdfColumns.length === 0) {
      window.alert('Select at least one PDF field before exporting.');
      return;
    }
    const targets = routesWithLinks.filter((entry) => entry.stopRows.length > 0);
    if (targets.length === 0) {
      window.alert('No routes have stops to export.');
      return;
    }
    setBusy(true);
    try {
      for (const { route, stopRows } of targets) {
        exportRoutePdf({
          project,
          route,
          rows: stopRows,
          columns: selectedPdfColumns,
        });
        // Yield to the browser between saves so each download is registered
        // separately. Without this, some browsers drop later downloads when
        // many fire in the same tick.
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      setBusy(false);
    }
  };

  const openAllLinks = (links: { url: string }[]) => {
    links.forEach((l) => window.open(l.url, '_blank', 'noopener,noreferrer'));
  };

  const copyFirstLink = async (routeId: string, link: string): Promise<boolean> => {
    const ok = await copyToClipboard(link);
    setCopyStatusByRoute((prev) => ({ ...prev, [routeId]: ok ? 'copied' : 'failed' }));
    window.setTimeout(() => {
      setCopyStatusByRoute((prev) => ({ ...prev, [routeId]: 'idle' }));
    }, 2000);
    return ok;
  };

  const togglePdfColumn = (columnId: string, checked: boolean) => {
    setSelectedPdfColumnIds((prev) => {
      if (checked) return prev.includes(columnId) ? prev : [...prev, columnId];
      return prev.filter((id) => id !== columnId);
    });
  };

  const selectedPdfColumns = useMemo(() => {
    const selected = new Set(selectedPdfColumnIds);
    return pdfColumnOptions.filter((option) => selected.has(option.id));
  }, [pdfColumnOptions, selectedPdfColumnIds]);
  const previewRouteWithRows = useMemo(
    () => routesWithLinks.find((entry) => entry.stopRows.length > 0),
    [routesWithLinks],
  );
  const previewRow = previewRouteWithRows?.stopRows[0];

  const exportRouteAsPdf = (
    route: Project['routes'][number],
    stopRows: ReturnType<typeof buildRouteStopRows>,
  ) => {
    if (selectedPdfColumns.length === 0) {
      window.alert('Select at least one PDF field before exporting.');
      return;
    }
    if (stopRows.length === 0) {
      window.alert('This route has no stops to include in the PDF.');
      return;
    }

    exportRoutePdf({
      project,
      route,
      rows: stopRows,
      columns: selectedPdfColumns,
    });
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
          {pdfColumnOptions.length > 0 && (
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                background: theme.inputBg,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.textPrimary }}>PDF fields</div>
              <div style={{ fontSize: 12, color: theme.textTertiary, marginTop: 2, marginBottom: 8 }}>
                Stop number is always included. Choose what other columns appear in each route PDF.
              </div>
              <div className="flex flex-wrap gap-3">
                {pdfColumnOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-1 cursor-pointer"
                    style={{ fontSize: 12, color: theme.textSecondary }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPdfColumnIds.includes(option.id)}
                      onChange={(event) => togglePdfColumn(option.id, event.target.checked)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    color: theme.textTertiary,
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.chrome,
                  }}
                >
                  Example PDF row
                  {previewRouteWithRows ? ` • ${previewRouteWithRows.route.name}` : ''}
                </div>
                {!previewRow ? (
                  <div style={{ padding: 8, fontSize: 12, color: theme.textTertiary }}>
                    Add at least one stop to preview PDF output.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={previewHeaderCell(theme)}>Stop #</th>
                          {selectedPdfColumns.map((column) => (
                            <th key={column.id} style={previewHeaderCell(theme)}>
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={previewBodyCell(theme, true)}>{previewRow.stopNumber}</td>
                          {selectedPdfColumns.map((column) => (
                            <td key={column.id} style={previewBodyCell(theme)}>
                              {resolvePdfCellValue(column, previewRow)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          {routesWithLinks.map(({ route, points, links, stopRows }) => {
            const usable = points.length >= 2;
            const split = links.length > 1;
            const primaryLink = links[0]?.url ?? '';
            const copyStatus = copyStatusByRoute[route.id] ?? 'idle';
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
                        onClick={() => void copyFirstLink(route.id, primaryLink)}
                        style={primaryBtn(theme)}
                        disabled={!primaryLink}
                      >
                        {copyStatus === 'copied'
                          ? 'Copied Maps link'
                          : copyStatus === 'failed'
                            ? 'Copy failed'
                            : 'Copy Maps Link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShareRoute({ routeName: route.name, url: primaryLink })}
                        style={secondaryBtn(theme)}
                        disabled={!primaryLink}
                      >
                        Show QR
                      </button>
                      <button type="button" onClick={() => openAllLinks(links)} style={secondaryBtn(theme)}>
                        Open in Google Maps
                        {split ? ` (${links.length} tabs)` : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportRouteAsPdf(route, stopRows)}
                        style={secondaryBtn(theme)}
                        disabled={stopRows.length === 0}
                      >
                        Export Route as PDF
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
              onClick={() => void exportAllAsPdf()}
              disabled={busy || routesWithLinks.every((r) => r.stopRows.length === 0)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: theme.accent,
                background: theme.inputBg,
                border: `1px solid ${theme.accent}`,
                borderRadius: 6,
                cursor:
                  busy || routesWithLinks.every((r) => r.stopRows.length === 0)
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  busy || routesWithLinks.every((r) => r.stopRows.length === 0) ? 0.6 : 1,
              }}
            >
              {busy ? 'Exporting…' : 'Export all as PDF'}
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
      {shareRoute && (
        <RouteShareModal
          theme={theme}
          routeName={shareRoute.routeName}
          url={shareRoute.url}
          onClose={() => setShareRoute(null)}
          onCopyLink={(url) => copyToClipboard(url)}
        />
      )}
    </div>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue to legacy fallback.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
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

function previewHeaderCell(theme: ThemeTokens): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: theme.textPrimary,
    background: theme.inputBg,
    borderBottom: `1px solid ${theme.border}`,
    borderRight: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
  };
}

function previewBodyCell(theme: ThemeTokens, rightAlign = false): React.CSSProperties {
  return {
    padding: '6px 8px',
    fontSize: 11,
    color: theme.textSecondary,
    borderBottom: `1px solid ${theme.border}`,
    borderRight: `1px solid ${theme.border}`,
    verticalAlign: 'top',
    textAlign: rightAlign ? 'right' : 'left',
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}
