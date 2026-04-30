import { useEffect, useState } from 'react';
import { geocode, reverseGeocode } from '@/lib/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import type { Depot, ThemeTokens } from '@/types';

interface DepotEditorProps {
  theme: ThemeTokens;
  token: string;
  onClose: () => void;
  onRequestMapPlacement: () => void;
  pendingMapPoint: { lat: number; lng: number } | null;
  onClearMapPoint: () => void;
}

export function DepotEditor({
  theme,
  token,
  onClose,
  onRequestMapPlacement,
  pendingMapPoint,
  onClearMapPoint,
}: DepotEditorProps) {
  const addDepot = useProjectStore((s) => s.addDepot);
  const project = useProjectStore((s) => s.project);
  const [mode, setMode] = useState<'address' | 'map'>(
    pendingMapPoint ? 'map' : 'address',
  );
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapResolvedAddress, setMapResolvedAddress] = useState<string>('');

  useEffect(() => {
    if (pendingMapPoint) setMode('map');
  }, [pendingMapPoint]);

  const handlePickFromMap = () => {
    setMode('map');
    onClose();
    onRequestMapPlacement();
  };

  const ensureLabel = (): string => {
    const trimmed = label.trim();
    if (trimmed) return trimmed;
    if (mode === 'address') {
      const a = address.trim();
      const short = a.split(',').slice(0, 2).join(',').trim();
      if (short) return short;
    }
    if (mode === 'map' && pendingMapPoint) {
      return `Depot ${pendingMapPoint.lat.toFixed(3)}, ${pendingMapPoint.lng.toFixed(3)}`;
    }
    return 'Depot';
  };

  const submit = async () => {
    if (!project) return;
    setError(null);
    setBusy(true);
    try {
      let depot: Depot;
      if (mode === 'address') {
        const a = address.trim();
        if (!a) {
          setError('Enter an address.');
          setBusy(false);
          return;
        }
        const r = await geocode(a, token);
        if (r.status === 'failed') {
          setError(r.reason ?? 'Could not geocode that address.');
          setBusy(false);
          return;
        }
        depot = {
          id: `depot-${Date.now()}`,
          label: ensureLabel(),
          address: r.resolvedAddress || a,
          lat: r.lat,
          lng: r.lng,
        };
      } else {
        if (!pendingMapPoint) {
          setError('Click a point on the map first.');
          setBusy(false);
          return;
        }
        depot = {
          id: `depot-${Date.now()}`,
          label: ensureLabel(),
          address: mapResolvedAddress,
          lat: pendingMapPoint.lat,
          lng: pendingMapPoint.lng,
        };
      }
      addDepot(depot);
      onClearMapPoint();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!pendingMapPoint) return;
    if (mapResolvedAddress) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await reverseGeocode(pendingMapPoint.lat, pendingMapPoint.lng, token);
        if (cancelled) return;
        setMapResolvedAddress(r.resolvedAddress);
        setLabel((existing) => existing || r.label);
      } catch {
        /* keep silent — label will fall back to coords */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMapPoint, token]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="overflow-hidden"
        style={{
          background: theme.chrome,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          width: 460,
          boxShadow: '0 20px 60px rgba(0,0,0,.15)',
        }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}` }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>
            Add depot
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

        <div style={{ padding: '20px 24px' }}>
          <div className="flex gap-2" style={{ marginBottom: 16 }}>
            <ModeBtn
              theme={theme}
              active={mode === 'address'}
              onClick={() => setMode('address')}
              disabled={busy}
            >
              Paste address
            </ModeBtn>
            <ModeBtn
              theme={theme}
              active={mode === 'map'}
              onClick={() => {
                if (!pendingMapPoint) handlePickFromMap();
                else setMode('map');
              }}
              disabled={busy}
            >
              Click on map
            </ModeBtn>
          </div>

          <label style={labelStyle(theme)}>Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={mode === 'map' ? 'Auto-suggested from coordinates' : 'e.g. Main Depot'}
            style={inputStyle(theme)}
            disabled={busy}
          />

          {mode === 'address' && (
            <>
              <label style={{ ...labelStyle(theme), marginTop: 14 }}>Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="100 Regina St N, Waterloo, ON N2J 4A9"
                style={inputStyle(theme)}
                disabled={busy}
              />
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: theme.textSecondary,
                  lineHeight: 1.5,
                }}
              >
                The address goes through the Mapbox geocoder to get coordinates.
              </div>
            </>
          )}

          {mode === 'map' && (
            <>
              <div style={{ ...labelStyle(theme), marginTop: 14 }}>Coordinates</div>
              {pendingMapPoint ? (
                <div
                  style={{
                    padding: '10px 12px',
                    background: theme.hoverBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    fontSize: 12,
                    color: theme.textSecondary,
                  }}
                >
                  <div className="tabular">
                    {pendingMapPoint.lat.toFixed(5)}, {pendingMapPoint.lng.toFixed(5)}
                  </div>
                  {mapResolvedAddress && (
                    <div style={{ marginTop: 4, color: theme.textPrimary }}>
                      {mapResolvedAddress}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handlePickFromMap}
                  style={{
                    padding: '10px 12px',
                    fontSize: 12,
                    width: '100%',
                    background: theme.hoverBg,
                    border: `1px dashed ${theme.border}`,
                    borderRadius: 6,
                    color: theme.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  Click to enable map placement, then click anywhere on the map.
                </button>
              )}
            </>
          )}

          {error && (
            <div
              style={{
                marginTop: 14,
                padding: '8px 12px',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: 6,
                fontSize: 12,
                color: '#991B1B',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="flex justify-end gap-2"
          style={{ padding: '14px 24px', borderTop: `1px solid ${theme.border}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              color: theme.textSecondary,
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (mode === 'map' && !pendingMapPoint)}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: theme.accent,
              border: 'none',
              borderRadius: 6,
              cursor:
                busy || (mode === 'map' && !pendingMapPoint) ? 'not-allowed' : 'pointer',
              opacity: busy || (mode === 'map' && !pendingMapPoint) ? 0.6 : 1,
            }}
          >
            {busy ? 'Adding…' : 'Add depot'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({
  theme,
  active,
  onClick,
  disabled,
  children,
}: {
  theme: ThemeTokens;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '8px 10px',
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${active ? theme.accent : theme.border}`,
        background: active ? theme.hoverBg : theme.inputBg,
        color: theme.textPrimary,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function labelStyle(theme: ThemeTokens): React.CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 600,
    color: theme.textPrimary,
    display: 'block',
    marginBottom: 6,
  };
}

function inputStyle(theme: ThemeTokens): React.CSSProperties {
  return {
    width: '100%',
    padding: '9px 12px',
    fontSize: 13,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    background: theme.inputBg,
    color: theme.textPrimary,
    outline: 'none',
  };
}
