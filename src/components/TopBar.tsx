import { useState } from 'react';
import type { ThemeTokens } from '@/types';

interface TopBarProps {
  theme: ThemeTokens;
  projectName: string;
  onImport: () => void;
  onExport: () => void;
  onSettings: () => void;
}

export function TopBar({ theme, projectName, onImport, onExport, onSettings }: TopBarProps) {
  return (
    <div
      className="flex items-center px-4 gap-2 flex-shrink-0 z-10"
      style={{
        height: 48,
        background: theme.chrome,
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 18, lineHeight: 1 }}>💼</span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.textPrimary,
            letterSpacing: '-0.01em',
          }}
        >
          {projectName}
        </span>
      </div>
      <div className="flex-1" />
      <span style={{ fontSize: 12, color: theme.textTertiary, marginRight: 4 }}>
        Saved
      </span>
      <TopBarBtn theme={theme} onClick={onImport}>
        Import CSV
      </TopBarBtn>
      <TopBarBtn theme={theme} onClick={onExport}>
        Export
      </TopBarBtn>
      <TopBarBtn theme={theme} onClick={onSettings} icon ariaLabel="Settings">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
            stroke={theme.textSecondary}
            strokeWidth="1.5"
          />
          <path
            d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
            stroke={theme.textSecondary}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </TopBarBtn>
    </div>
  );
}

interface TopBarBtnProps {
  theme: ThemeTokens;
  onClick: () => void;
  children: React.ReactNode;
  icon?: boolean;
  ariaLabel?: string;
}

function TopBarBtn({ theme, onClick, children, icon, ariaLabel }: TopBarBtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: icon ? '4px 8px' : '4px 12px',
        fontSize: 13,
        fontWeight: 500,
        color: theme.textSecondary,
        background: hov ? theme.hoverBg : 'transparent',
        border: `1px solid ${hov ? theme.border : 'transparent'}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 150ms ease-out',
      }}
    >
      {children}
    </button>
  );
}
