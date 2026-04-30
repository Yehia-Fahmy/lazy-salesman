import { useRef, useState } from 'react';
import { THEMES } from '@/theme';
import type { ThemeName, ThemeTokens } from '@/types';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import {
  buildExportPayload,
  downloadJson,
  importJsonFile,
} from '@/lib/jsonExport';
import { resetCurrentProject } from '@/lib/projectPersistence';

interface SettingsProps {
  theme: ThemeTokens;
  themeName: ThemeName;
  token: string;
  onTokenChange: (token: string) => void;
  onThemeChange: (theme: ThemeName) => void;
  onClose: () => void;
}

type IoStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; label: string }
  | { kind: 'error'; label: string };

export function Settings({
  theme,
  themeName,
  token,
  onTokenChange,
  onThemeChange,
  onClose,
}: SettingsProps) {
  const [draft, setDraft] = useState(token);
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const setActiveRouteId = useUIStore((s) => s.setActiveRouteId);
  const setOpenPopupStopId = useUIStore((s) => s.setOpenPopupStopId);
  const setVisibleRoutes = useUIStore((s) => s.setVisibleRoutes);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [io, setIo] = useState<IoStatus>({ kind: 'idle' });

  const save = () => {
    onTokenChange(draft.trim());
    onClose();
  };

  const handleExport = async () => {
    if (!project) {
      setIo({ kind: 'error', label: 'No project to export.' });
      return;
    }
    setIo({ kind: 'busy', label: 'Building export…' });
    try {
      const payload = await buildExportPayload(project);
      downloadJson(payload);
      setIo({ kind: 'ok', label: `Exported ${payload.geocode_cache.length} cached geocodes.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIo({ kind: 'error', label: msg });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = async () => {
    if (!project) {
      setIo({ kind: 'error', label: 'No project to reset.' });
      return;
    }
    const ok = confirm(
      'Reset project? This permanently deletes ALL stops, depots, and routes for the current project. The geocode cache and import templates are kept.',
    );
    if (!ok) return;
    setIo({ kind: 'busy', label: 'Resetting…' });
    try {
      await resetCurrentProject();
      setActiveRouteId(null);
      setOpenPopupStopId(null);
      setVisibleRoutes(new Set(['unassigned']));
      setIo({ kind: 'ok', label: 'Project cleared.' });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIo({ kind: 'error', label: msg });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIo({ kind: 'busy', label: 'Importing…' });
    try {
      const result = await importJsonFile(file);
      setProject(result.project);
      setIo({
        kind: 'ok',
        label: `Imported "${result.project.name}" — ${result.project.stops.length} stops, ${result.project.routes.length} routes, ${result.geocodeCount} cached geocodes.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIo({ kind: 'error', label: msg });
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="overflow-hidden"
        style={{
          background: theme.chrome,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          width: 540,
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,.15)',
        }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}` }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>
            Settings
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.textTertiary,
              fontSize: 20,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <SectionTitle theme={theme}>Mapbox token</SectionTitle>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="pk.eyJ1Ij..."
            style={{
              width: '100%',
              padding: '9px 12px',
              fontSize: 13,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              background: theme.inputBg,
              color: theme.textPrimary,
              outline: 'none',
            }}
          />
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: theme.textSecondary,
              lineHeight: 1.6,
            }}
          >
            Generate a token at{' '}
            <span style={{ color: theme.accent }}>
              mapbox.com → Account → Tokens
            </span>
            . Leave the default <strong>Public scopes</strong> checked — Mapbox
            includes Geocoding and Directions in every token by default. Do not
            enable any <strong>Secret scopes</strong>. Recommended: restrict the
            token to your URL under <em>Token restrictions</em>.
          </div>
          {!draft && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                background: '#FFF7ED',
                border: '1px solid #FED7AA',
                borderRadius: 6,
                fontSize: 12,
                color: '#9A3412',
              }}
            >
              No token set — CSV import and route ETA are blocked until you add one.
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <SectionTitle theme={theme}>Theme</SectionTitle>
            <div className="flex gap-2">
              {(Object.keys(THEMES) as ThemeName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onThemeChange(name)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: 12,
                    fontWeight: 500,
                    border: `1px solid ${themeName === name ? theme.accent : theme.border}`,
                    background: themeName === name ? theme.hoverBg : theme.inputBg,
                    color: theme.textPrimary,
                    borderRadius: 6,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {THEMES[name].name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <SectionTitle theme={theme}>Danger zone</SectionTitle>
            <div
              style={{
                fontSize: 12,
                color: theme.textSecondary,
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Wipe the current project — all stops, depots, and routes. Cached
              geocodes and import templates are kept so re-imports stay fast.
            </div>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={!project || io.kind === 'busy'}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: '#DC2626',
                background: 'transparent',
                border: '1px solid #FCA5A5',
                borderRadius: 6,
                cursor: !project || io.kind === 'busy' ? 'not-allowed' : 'pointer',
                opacity: !project || io.kind === 'busy' ? 0.5 : 1,
              }}
            >
              Reset project
            </button>
          </div>

          <div style={{ marginTop: 24 }}>
            <SectionTitle theme={theme}>Backup</SectionTitle>
            <div
              style={{
                fontSize: 12,
                color: theme.textSecondary,
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Export the current project (depots, routes, stops, schema) plus the
              matching geocode-cache slice as JSON. Imports replace the project with
              the same id. The Mapbox token is never included.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!project || io.kind === 'busy'}
                style={btnStyle(theme, false, !project || io.kind === 'busy')}
              >
                Export project as JSON
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                disabled={io.kind === 'busy'}
                style={btnStyle(theme, false, io.kind === 'busy')}
              >
                Import from JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleImportFile(e)}
                style={{ display: 'none' }}
              />
            </div>
            {io.kind !== 'idle' && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  fontSize: 12,
                  background:
                    io.kind === 'error'
                      ? '#FEF2F2'
                      : io.kind === 'ok'
                        ? '#F0FDF4'
                        : theme.hoverBg,
                  color:
                    io.kind === 'error'
                      ? '#991B1B'
                      : io.kind === 'ok'
                        ? '#166534'
                        : theme.textSecondary,
                  border:
                    io.kind === 'error'
                      ? '1px solid #FCA5A5'
                      : io.kind === 'ok'
                        ? '1px solid #86EFAC'
                        : `1px solid ${theme.border}`,
                  borderRadius: 6,
                }}
              >
                {io.label}
              </div>
            )}
          </div>
        </div>

        <div
          className="flex justify-end gap-2"
          style={{ padding: '14px 24px', borderTop: `1px solid ${theme.border}` }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              color: theme.textSecondary,
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: theme.accent,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  theme,
  children,
}: {
  theme: ThemeTokens;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: theme.textPrimary,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function btnStyle(theme: ThemeTokens, primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 500,
    color: primary ? '#fff' : theme.textPrimary,
    background: primary ? theme.accent : theme.inputBg,
    border: `1px solid ${primary ? theme.accent : theme.border}`,
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
