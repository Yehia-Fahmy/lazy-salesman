import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { ThemeTokens } from '@/types';

interface RouteShareModalProps {
  theme: ThemeTokens;
  routeName: string;
  url: string;
  onClose: () => void;
  onCopyLink: (url: string) => Promise<boolean>;
}

export function RouteShareModal({
  theme,
  routeName,
  url,
  onClose,
  onCopyLink,
}: RouteShareModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { width: 256, margin: 2 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleCopy = async () => {
    const ok = await onCopyLink(url);
    setCopyState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1100, background: 'rgba(0,0,0,0.45)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '92vw',
          background: theme.chrome,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,.15)',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary }}>{routeName}</div>
            <div style={{ fontSize: 12, color: theme.textTertiary }}>Scan to open in Google Maps</div>
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
        <div style={{ padding: 16 }}>
          <div
            className="flex items-center justify-center"
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              background: '#fff',
              minHeight: 280,
            }}
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`${routeName} Google Maps QR`} width={256} height={256} />
            ) : (
              <span style={{ color: theme.textSecondary, fontSize: 12 }}>Generating QR code…</span>
            )}
          </div>
          <div
            title={url}
            style={{
              marginTop: 10,
              fontSize: 11,
              color: theme.textTertiary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {url}
          </div>
          <div className="flex justify-end gap-2" style={{ marginTop: 12 }}>
            <button type="button" onClick={onClose} style={secondaryBtn(theme)}>
              Close
            </button>
            <button type="button" onClick={() => void handleCopy()} style={primaryBtn(theme)}>
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
