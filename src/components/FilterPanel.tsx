import { useState } from 'react';
import { countUnassigned } from '@/lib/stopRoutes';
import type { Depot, Route, Stop, ThemeTokens } from '@/types';

interface FilterPanelProps {
  theme: ThemeTokens;
  routes: Route[];
  stops: Stop[];
  depots: Depot[];
  visibleRoutes: Set<string>;
  onToggleRoute: (id: string) => void;
  onAddRoute: () => void;
  onAddDepot: () => void;
  onEditRoute: (id: string) => void;
  onDeleteDepot: (id: string) => void;
}

export function FilterPanel({
  theme,
  routes,
  stops,
  depots,
  visibleRoutes,
  onToggleRoute,
  onAddRoute,
  onAddDepot,
  onEditRoute,
  onDeleteDepot,
}: FilterPanelProps) {
  const unassignedCount = countUnassigned(stops, routes);
  const unassignedVisible = visibleRoutes.has('unassigned');

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Depots */}
      <div className="flex items-center" style={{ padding: '0 16px 6px' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.textTertiary,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          Depots ({depots.length})
        </span>
        <button
          type="button"
          onClick={onAddDepot}
          style={addBtnStyle(theme.accent)}
        >
          <span style={{ fontSize: 11 }}>◆</span> Add depot
        </button>
      </div>
      {depots.length === 0 ? (
        <div style={{ padding: '4px 16px 8px', fontSize: 12, color: theme.textTertiary }}>
          No depots yet. Routes need a start/end depot to anchor their polyline.
        </div>
      ) : (
        depots.map((d) => <DepotRow key={d.id} theme={theme} depot={d} onDelete={() => onDeleteDepot(d.id)} />)
      )}

      <div style={{ height: 1, background: theme.border, margin: '8px 0' }} />

      {/* Routes (visibility toggles) */}
      <div className="flex items-center" style={{ padding: '0 16px 6px' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.textTertiary,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          Routes
        </span>
        <button
          type="button"
          onClick={onAddRoute}
          style={addBtnStyle(theme.accent)}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New route
        </button>
      </div>
      <div style={{ padding: '4px 0' }}>
        {routes.map((r) => {
          const count = r.stop_ids.length;
          const visible = visibleRoutes.has(r.id);
          return (
            <FilterRow
              key={r.id}
              theme={theme}
              color={r.color}
              label={r.name}
              count={count}
              visible={visible}
              onToggle={() => onToggleRoute(r.id)}
              onClick={() => onEditRoute(r.id)}
              clickHint="Edit"
              eta={r.total_minutes > 0 ? `~${r.total_minutes} min · ${r.total_km} km` : undefined}
            />
          );
        })}
        <FilterRow
          theme={theme}
          color={theme.textTertiary}
          label="Unassigned"
          count={unassignedCount}
          visible={unassignedVisible}
          onToggle={() => onToggleRoute('unassigned')}
          dashed
        />
      </div>
    </div>
  );
}

function DepotRow({
  theme,
  depot,
  onDelete,
}: {
  theme: ThemeTokens;
  depot: Depot;
  onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-2"
      style={{
        padding: '4px 16px',
        background: hov ? theme.hoverBg : 'transparent',
        transition: 'background 100ms',
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          background: '#18181B',
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }}
      />
      <span
        className="flex-1"
        style={{
          fontSize: 12,
          color: theme.textPrimary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {depot.label}
      </span>
      {hov && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete depot ${depot.label}`}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.textTertiary,
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface FilterRowProps {
  theme: ThemeTokens;
  color: string;
  label: string;
  count: number;
  visible: boolean;
  onToggle: () => void;
  onClick?: () => void;
  clickHint?: string;
  eta?: string;
  dashed?: boolean;
}

function FilterRow({
  theme,
  color,
  label,
  count,
  visible,
  onToggle,
  onClick,
  clickHint,
  eta,
  dashed,
}: FilterRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onClick?.()}
      style={{
        padding: '5px 16px',
        cursor: onClick ? 'pointer' : 'default',
        background: hov && onClick ? theme.hoverBg : 'transparent',
        transition: 'background 100ms',
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={`Toggle visibility of ${label}`}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            flexShrink: 0,
            background: visible ? color : 'transparent',
            border: `2px solid ${color}`,
            opacity: visible ? 1 : 0.5,
            cursor: 'pointer',
            padding: 0,
            ...(dashed ? { borderStyle: 'dashed' } : {}),
          }}
        />
        <span
          className="flex-1"
          style={{
            fontSize: 13,
            color: theme.textPrimary,
            opacity: visible ? 1 : 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span
          className="tabular"
          style={{ fontSize: 12, color: theme.textTertiary }}
        >
          {count}
        </span>
      </div>
      {(eta || (hov && clickHint)) && (
        <div
          className="flex gap-2"
          style={{ paddingLeft: 22, marginTop: 2, alignItems: 'center' }}
        >
          {eta && (
            <span style={{ fontSize: 11, color: theme.textTertiary }}>{eta}</span>
          )}
          {hov && clickHint && (
            <span style={{ fontSize: 11, color: theme.accent, fontWeight: 500 }}>
              {clickHint} →
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function addBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    color,
    padding: 0,
    fontWeight: 500,
  };
}
