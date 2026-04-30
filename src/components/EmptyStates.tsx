import type { ThemeTokens } from '@/types';

interface NoTokenProps {
  theme: ThemeTokens;
  onOpenSettings: () => void;
  message?: string;
}

export function NoToken({ theme, onOpenSettings, message }: NoTokenProps) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        padding: 24,
        gap: 10,
        color: theme.textSecondary,
      }}
    >
      <div style={{ fontSize: 28 }}>🔑</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary }}>
        Mapbox token required
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 280 }}>
        {message ??
          'CSV geocoding and route ETA both call the Mapbox API. Add your token in Settings to continue.'}
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          marginTop: 6,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          color: '#fff',
          background: theme.accent,
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Open Settings
      </button>
    </div>
  );
}

interface NoCsvProps {
  theme: ThemeTokens;
  onImport: () => void;
  blocked?: boolean;
}

export function NoCsvCenterCard({ theme, onImport, blocked }: NoCsvProps) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 400 }}
    >
      <div
        className="pointer-events-auto"
        style={{
          background: theme.popupBg,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          padding: '20px 24px',
          maxWidth: 360,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📍</div>
        <div
          style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}
        >
          {blocked ? 'Add a Mapbox token to import' : 'Upload a CSV to add stops'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: theme.textSecondary,
            lineHeight: 1.5,
            marginBottom: 14,
          }}
        >
          {blocked
            ? 'Geocoding requires a Mapbox token. Open Settings to paste one.'
            : 'The 5-step wizard auto-detects address columns and previews geocoding before importing all rows.'}
        </div>
        <button
          type="button"
          onClick={onImport}
          disabled={blocked}
          style={{
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 500,
            color: '#fff',
            background: blocked ? theme.textTertiary : theme.accent,
            border: 'none',
            borderRadius: 6,
            cursor: blocked ? 'not-allowed' : 'pointer',
          }}
        >
          {blocked ? 'Token required' : 'Import CSV'}
        </button>
      </div>
    </div>
  );
}
