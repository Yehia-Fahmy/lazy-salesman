import { useState } from 'react';
import { stopLabel } from '@/lib/labelTemplate';
import type { Stop, ThemeTokens } from '@/types';

function FlaggedRow({
  theme,
  stop,
  label,
  onFix,
  onDelete,
}: {
  theme: ThemeTokens;
  stop: Stop;
  label: string;
  onFix: () => void;
  onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '8px 16px',
        background: hov ? theme.hoverBg : 'transparent',
        borderLeft: '2px solid #DC2626',
        transition: 'background 100ms',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="flex-1"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#DC2626',
          marginTop: 1,
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        {stop.attention_reason ?? 'Geocoding flagged this row.'}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onFix}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: '#fff',
            background: theme.accent,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Fix…
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete "${label}"?`)) onDelete();
          }}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            color: '#DC2626',
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

interface NeedsAttentionPanelProps {
  theme: ThemeTokens;
  stops: Stop[];
  labelTemplate: string;
  onFixStop: (id: string) => void;
  onDeleteStop: (id: string) => void;
}

export function NeedsAttentionPanel({
  theme,
  stops,
  labelTemplate,
  onFixStop,
  onDeleteStop,
}: NeedsAttentionPanelProps) {
  const flagged = stops.filter((s) => s.needs_attention);
  const [collapsed, setCollapsed] = useState(false);
  if (flagged.length === 0) return null;

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
            color: '#DC2626',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          ⚠ Needs Attention ({flagged.length})
        </span>
        <span style={{ fontSize: 10, color: theme.textTertiary }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </div>
      {!collapsed &&
        flagged.map((stop) => (
          <FlaggedRow
            key={stop.id}
            theme={theme}
            stop={stop}
            label={stopLabel(stop, labelTemplate)}
            onFix={() => onFixStop(stop.id)}
            onDelete={() => onDeleteStop(stop.id)}
          />
        ))}
    </div>
  );
}
