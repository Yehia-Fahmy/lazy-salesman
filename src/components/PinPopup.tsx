import { useState } from 'react';
import { stopLabel } from '@/lib/labelTemplate';
import { getStopRouteIds } from '@/lib/stopRoutes';
import type { ColumnDef, Route, Stop, ThemeTokens } from '@/types';

interface PinPopupProps {
  theme: ThemeTokens;
  stop: Stop;
  schema: ColumnDef[];
  labelTemplate: string;
  routes: Route[];
  activeRouteId: string | null;
  onToggleRouteMembership: (routeId: string, stopId: string) => void;
  onAddToActiveRoute: (stopId: string) => void;
  onDeleteStop: (stopId: string) => void;
  onEditStop: (stopId: string) => void;
  onClose: () => void;
}

export function PinPopup({
  theme,
  stop,
  schema,
  labelTemplate,
  routes,
  activeRouteId,
  onToggleRouteMembership,
  onAddToActiveRoute,
  onDeleteStop,
  onEditStop,
  onClose,
}: PinPopupProps) {
  const [showSensitive, setShowSensitive] = useState(false);
  const label = stopLabel(stop, labelTemplate);
  const infoFields = schema.filter((c) => c.role === 'info');
  const sensitiveFields = schema.filter((c) => c.sensitive && c.role !== 'label');
  const assignedIds = new Set(getStopRouteIds(stop.id, routes));

  return (
    <div
      style={{
        background: theme.popupBg,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        width: 300,
        fontSize: 13,
        color: theme.textPrimary,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex justify-between items-start">
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{label}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.textTertiary,
              fontSize: 18,
              padding: 0,
              marginLeft: 8,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            fontSize: 12,
            color: theme.textSecondary,
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          📍 {stop.composed_address}
        </div>
        {assignedIds.size > 0 && (
          <div className="flex items-center gap-1" style={{ marginTop: 5, flexWrap: 'wrap' }}>
            {routes
              .filter((r) => assignedIds.has(r.id))
              .map((r) => (
                <span
                  key={r.id}
                  className="flex items-center gap-1"
                  style={{
                    fontSize: 11,
                    color: theme.textSecondary,
                    background: theme.hoverBg,
                    padding: '1px 6px',
                    borderRadius: 99,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: r.color,
                    }}
                  />
                  {r.name}
                </span>
              ))}
          </div>
        )}
        {stop.geocode_status === 'low_confidence' && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: '#DC2626',
              background: '#FEF2F2',
              padding: '3px 6px',
              borderRadius: 4,
              display: 'inline-block',
            }}
          >
            ⚠ Low confidence geocode
          </div>
        )}
      </div>

      {infoFields.length > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${theme.border}` }}>
          {infoFields.map((f) => {
            const val = stop.fields[f.name];
            if (val === undefined || val === '') return null;
            const fieldLabel =
              f.name.length > 36 ? `${f.name.replace(/\?.*/, '').trim().substring(0, 34)}…` : f.name;
            return (
              <div
                key={f.name}
                className="flex items-start gap-2"
                style={{ marginBottom: 4, fontSize: 12 }}
              >
                <span
                  title={f.name}
                  style={{ color: theme.textSecondary, flex: '0 0 140px', lineHeight: 1.4 }}
                >
                  {fieldLabel}
                </span>
                <span style={{ color: theme.textPrimary, fontWeight: 500, flex: 1 }}>
                  {String(val)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {sensitiveFields.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${theme.border}` }}>
          {!showSensitive ? (
            <button
              type="button"
              onClick={() => setShowSensitive(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                color: theme.textSecondary,
                padding: 0,
              }}
            >
              🔒 Show sensitive ({sensitiveFields.length} hidden)
            </button>
          ) : (
            sensitiveFields.map((f) => (
              <div
                key={f.name}
                className="flex gap-2"
                style={{ marginBottom: 3, fontSize: 12 }}
              >
                <span style={{ color: theme.textSecondary, flex: '0 0 80px' }}>
                  {f.name.split(' ')[0]}
                </span>
                <span style={{ color: theme.textPrimary }}>
                  {stop.fields[f.name] !== undefined ? String(stop.fields[f.name]) : '—'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ padding: '10px 14px' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.textTertiary,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Routes ({assignedIds.size})
        </div>
        {routes.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.textTertiary, marginBottom: 8 }}>
            No routes yet — create one in the sidebar.
          </div>
        ) : (
          <div style={{ marginBottom: 8, maxHeight: 132, overflowY: 'auto' }}>
            {routes.map((r) => {
              const checked = assignedIds.has(r.id);
              return (
                <label
                  key={r.id}
                  className="flex items-center gap-2 cursor-pointer"
                  style={{
                    padding: '4px 0',
                    fontSize: 12,
                    color: theme.textPrimary,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleRouteMembership(r.id, stop.id)}
                    style={{ accentColor: r.color }}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: r.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="flex-1"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.name}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => onAddToActiveRoute(stop.id)}
          disabled={!activeRouteId}
          style={{
            width: '100%',
            padding: '7px 0',
            background: activeRouteId ? theme.accent : theme.hoverBg,
            color: activeRouteId ? '#fff' : theme.textSecondary,
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: activeRouteId ? 'pointer' : 'not-allowed',
          }}
        >
          {activeRouteId
            ? assignedIds.has(activeRouteId)
              ? '✓ In active route — click to remove'
              : '+ Add to active route'
            : 'Start editing a route first'}
        </button>
        <div className="flex gap-2" style={{ marginTop: 6 }}>
          <button
            type="button"
            onClick={() => onEditStop(stop.id)}
            style={{
              flex: 1,
              padding: '6px 0',
              background: 'transparent',
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete this stop?`)) onDeleteStop(stop.id);
            }}
            style={{
              flex: 1,
              padding: '6px 0',
              background: 'transparent',
              color: '#DC2626',
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
