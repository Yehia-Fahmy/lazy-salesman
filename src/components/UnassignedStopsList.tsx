import { useState } from 'react';
import { stopLabel } from '@/lib/labelTemplate';
import { isStopUnassigned } from '@/lib/stopRoutes';
import type { Route, Stop, ThemeTokens } from '@/types';

function StopRow({
  theme,
  stop,
  label,
  onClick,
  onDelete,
}: {
  theme: ThemeTokens;
  stop: Stop;
  label: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        padding: '6px 16px',
        cursor: 'pointer',
        background: hov ? theme.hoverBg : 'transparent',
        borderLeft: stop.needs_attention
          ? '2px solid #DC2626'
          : '2px solid transparent',
        transition: 'background 100ms',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="flex-shrink-0"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: theme.textTertiary,
          }}
        />
        <span
          className="flex-1 overflow-hidden"
          style={{
            fontSize: 13,
            color: theme.textPrimary,
            fontWeight: 500,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {stop.needs_attention && (
          <span style={{ fontSize: 11, color: '#DC2626' }}>⚠</span>
        )}
        {hov && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${label}"?`)) onDelete();
            }}
            aria-label={`Delete ${label}`}
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
      <div
        style={{
          fontSize: 11,
          color: theme.textTertiary,
          marginTop: 1,
          paddingLeft: 14,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {stop.composed_address}
      </div>
    </div>
  );
}

interface UnassignedStopsListProps {
  theme: ThemeTokens;
  stops: Stop[];
  routes: Route[];
  labelTemplate: string;
  onStopClick: (id: string) => void;
  onDeleteStop: (id: string) => void;
}

export function UnassignedStopsList({
  theme,
  stops,
  routes,
  labelTemplate,
  onStopClick,
  onDeleteStop,
}: UnassignedStopsListProps) {
  const unassigned = stops.filter((s) => isStopUnassigned(s.id, routes));
  const [collapsed, setCollapsed] = useState(false);
  if (unassigned.length === 0) return null;

  return (
    <div style={{ padding: '12px 0' }}>
      <div
        className="flex items-center cursor-pointer"
        style={{ padding: '0 16px 6px', gap: 4 }}
        onClick={() => setCollapsed((c) => !c)}
      >
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
          Unassigned ({unassigned.length})
        </span>
        <span style={{ fontSize: 10, color: theme.textTertiary }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </div>
      {!collapsed &&
        unassigned.map((stop) => (
          <StopRow
            key={stop.id}
            theme={theme}
            stop={stop}
            label={stopLabel(stop, labelTemplate)}
            onClick={() => onStopClick(stop.id)}
            onDelete={() => onDeleteStop(stop.id)}
          />
        ))}
    </div>
  );
}
