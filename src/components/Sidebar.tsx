import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/types';

interface SidebarProps {
  theme: ThemeTokens;
  width?: number;
  children: ReactNode;
}

export function Sidebar({ theme, width = 320, children }: SidebarProps) {
  return (
    <aside
      className="flex flex-col flex-shrink-0 overflow-y-auto overflow-x-hidden"
      style={{
        width,
        background: theme.sidebar,
        borderLeft: `1px solid ${theme.border}`,
      }}
    >
      {children}
    </aside>
  );
}

export function SectionLabel({
  theme,
  children,
}: {
  theme: ThemeTokens;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: '0 16px 6px',
        fontSize: 11,
        fontWeight: 600,
        color: theme.textTertiary,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

export function Divider({ theme }: { theme: ThemeTokens }) {
  return <div style={{ height: 1, background: theme.border, margin: '4px 0' }} />;
}
