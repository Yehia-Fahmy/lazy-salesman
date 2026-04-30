import { useMemo, useState } from 'react';
import { buildComposedAddress } from '@/lib/csv';
import { db } from '@/lib/db';
import { geocode } from '@/lib/mapbox';
import { stopLabel } from '@/lib/labelTemplate';
import { useProjectStore } from '@/store/useProjectStore';
import type { ColumnDef, Stop, ThemeTokens } from '@/types';

interface StopEditorProps {
  theme: ThemeTokens;
  stop: Stop;
  schema: ColumnDef[];
  labelTemplate: string;
  token: string;
  onClose: () => void;
}

export function StopEditor({
  theme,
  stop,
  schema,
  labelTemplate,
  token,
  onClose,
}: StopEditorProps) {
  const upsertStop = useProjectStore((s) => s.upsertStop);

  const [fields, setFields] = useState<Record<string, string | number>>({
    ...stop.fields,
  });
  const [lat, setLat] = useState(String(stop.lat));
  const [lng, setLng] = useState(String(stop.lng));
  const [showSensitive, setShowSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group fields by role for the form
  const groups = useMemo(() => {
    const byRole = (roles: string[]) =>
      schema.filter((c) => roles.includes(c.role) && !c.sensitive && c.role !== 'ignore');
    return {
      address: byRole([
        'address_full',
        'address_street',
        'address_line2',
        'address_city',
        'address_region',
        'address_postal',
        'address_country',
      ]),
      label: schema.filter((c) => c.role === 'label' && !c.sensitive),
      info: byRole(['info']),
      sensitive: schema.filter((c) => c.sensitive),
    };
  }, [schema]);

  const previewAddress = useMemo(
    () => buildComposedAddress(fieldsAsRecord(fields), schema),
    [fields, schema],
  );
  const addressChanged = previewAddress !== stop.composed_address;

  const setField = (name: string, value: string) => {
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  const save = async (forceGeocode: boolean) => {
    setBusy(true);
    setError(null);
    try {
      let nextStop: Stop = {
        ...stop,
        fields: { ...fields },
        composed_address: previewAddress,
      };

      const manualLat = parseFloat(lat);
      const manualLng = parseFloat(lng);
      const coordsChanged =
        Number.isFinite(manualLat) &&
        Number.isFinite(manualLng) &&
        (manualLat !== stop.lat || manualLng !== stop.lng);

      const shouldGeocode =
        (forceGeocode || addressChanged) && previewAddress.trim().length > 0;

      if (shouldGeocode) {
        if (!token) {
          setError('Mapbox token required to re-geocode. Add one in Settings.');
          setBusy(false);
          return;
        }
        const r = await geocode(previewAddress, token);
        if (r.status === 'failed') {
          setError(r.reason ?? 'Geocoding failed.');
          setBusy(false);
          return;
        }
        await db.geocodeCache.put({
          composed_address: previewAddress,
          lat: r.lat,
          lng: r.lng,
          confidence: r.confidence,
          status: r.status,
          ...(r.reason !== undefined ? { reason: r.reason } : {}),
          resolved_address: r.resolvedAddress,
          cached_at: new Date().toISOString(),
        });
        nextStop = {
          ...nextStop,
          lat: r.lat,
          lng: r.lng,
          geocode_status: r.status,
          geocode_confidence: r.confidence,
          needs_attention: r.status !== 'ok',
          ...(r.reason !== undefined ? { attention_reason: r.reason } : {}),
        };
        // If coordinates were manually edited but address re-geocode succeeded,
        // prefer the geocoded coords (manual edit is a fallback path).
      } else if (coordsChanged) {
        nextStop = {
          ...nextStop,
          lat: manualLat,
          lng: manualLng,
          geocode_status: 'ok',
          geocode_confidence: 1,
          needs_attention: false,
        };
        // Strip stale attention_reason
        delete (nextStop as { attention_reason?: string }).attention_reason;
      }

      // If address became empty, that's a user-error; flag it
      if (!previewAddress.trim()) {
        nextStop = {
          ...nextStop,
          needs_attention: true,
          attention_reason: 'Address empty after edit — fill at least one address field.',
        };
      }

      upsertStop(nextStop);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const headerLabel = stopLabel({ ...stop, fields }, labelTemplate);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          background: theme.chrome,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          width: 620,
          maxHeight: '88vh',
          boxShadow: '0 20px 60px rgba(0,0,0,.2)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}` }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>
              Edit stop
            </div>
            <div style={{ fontSize: 12, color: theme.textTertiary, marginTop: 2 }}>
              {headerLabel}
            </div>
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
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '16px 24px' }}>
          {groups.address.length > 0 && (
            <FieldGroup theme={theme} title="Address" hint="Changes here will re-geocode the pin on save.">
              {groups.address.map((c) => (
                <FieldRow
                  key={c.name}
                  theme={theme}
                  name={c.name}
                  role={c.role}
                  value={String(fields[c.name] ?? '')}
                  onChange={(v) => setField(c.name, v)}
                  busy={busy}
                />
              ))}
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: addressChanged ? theme.accent : theme.textTertiary,
                  background: theme.hoverBg,
                  padding: '6px 8px',
                  borderRadius: 4,
                }}
              >
                {addressChanged ? 'Will geocode: ' : 'Geocoded as: '}
                <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
                  {previewAddress || '(empty)'}
                </span>
              </div>
            </FieldGroup>
          )}

          {groups.label.length > 0 && (
            <FieldGroup theme={theme} title="Label fields">
              {groups.label.map((c) => (
                <FieldRow
                  key={c.name}
                  theme={theme}
                  name={c.name}
                  role={c.role}
                  value={String(fields[c.name] ?? '')}
                  onChange={(v) => setField(c.name, v)}
                  busy={busy}
                />
              ))}
            </FieldGroup>
          )}

          {groups.info.length > 0 && (
            <FieldGroup theme={theme} title="Info fields">
              {groups.info.map((c) => (
                <FieldRow
                  key={c.name}
                  theme={theme}
                  name={c.name}
                  role={c.role}
                  value={String(fields[c.name] ?? '')}
                  onChange={(v) => setField(c.name, v)}
                  busy={busy}
                  multilineThreshold={60}
                />
              ))}
            </FieldGroup>
          )}

          {groups.sensitive.length > 0 && (
            <FieldGroup
              theme={theme}
              title={
                <span className="flex items-center gap-2">
                  <span>Sensitive (PII)</span>
                  <button
                    type="button"
                    onClick={() => setShowSensitive((s) => !s)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: theme.accent,
                      padding: 0,
                    }}
                  >
                    {showSensitive ? 'Hide' : 'Show'}
                  </button>
                </span>
              }
            >
              {showSensitive &&
                groups.sensitive.map((c) => (
                  <FieldRow
                    key={c.name}
                    theme={theme}
                    name={c.name}
                    role={c.role}
                    sensitive
                    value={String(fields[c.name] ?? '')}
                    onChange={(v) => setField(c.name, v)}
                    busy={busy}
                  />
                ))}
              {!showSensitive && (
                <div style={{ fontSize: 12, color: theme.textTertiary }}>
                  {groups.sensitive.length} hidden field
                  {groups.sensitive.length === 1 ? '' : 's'}.
                </div>
              )}
            </FieldGroup>
          )}

          <FieldGroup
            theme={theme}
            title="Coordinates"
            hint="Edit to manually drop the pin. Re-geocoding from address overrides these."
          >
            <div className="flex gap-2">
              <NumberField
                theme={theme}
                label="Latitude"
                value={lat}
                onChange={setLat}
                busy={busy}
              />
              <NumberField
                theme={theme}
                label="Longitude"
                value={lng}
                onChange={setLng}
                busy={busy}
              />
            </div>
          </FieldGroup>

          {error && (
            <div
              style={{
                marginTop: 12,
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
          className="flex items-center justify-between"
          style={{ padding: '14px 24px', borderTop: `1px solid ${theme.border}` }}
        >
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={busy || !token}
            title={!token ? 'Mapbox token required' : 'Re-geocode using the current address fields'}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: theme.textPrimary,
              background: theme.inputBg,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              cursor: busy || !token ? 'not-allowed' : 'pointer',
              opacity: busy || !token ? 0.5 : 1,
            }}
          >
            Re-geocode
          </button>
          <div className="flex gap-2">
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
              onClick={() => void save(false)}
              disabled={busy}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: theme.accent,
                border: 'none',
                borderRadius: 6,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? 'Saving…' : addressChanged ? 'Save & geocode' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fieldsAsRecord(
  fields: Record<string, string | number>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = String(v);
  return out;
}

function FieldGroup({
  theme,
  title,
  hint,
  children,
}: {
  theme: ThemeTokens;
  title: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
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
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

interface FieldRowProps {
  theme: ThemeTokens;
  name: string;
  role: string;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  sensitive?: boolean;
  multilineThreshold?: number;
}

function FieldRow({
  theme,
  name,
  role,
  value,
  onChange,
  busy,
  sensitive,
  multilineThreshold = 80,
}: FieldRowProps) {
  const useTextarea = value.length > multilineThreshold || name.length > 50;
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
        <span
          style={{
            fontSize: 12,
            color: theme.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={name}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: 10,
            color: sensitive ? '#DC2626' : theme.textTertiary,
            background: sensitive ? '#FEF2F2' : theme.hoverBg,
            padding: '1px 5px',
            borderRadius: 3,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          {sensitive ? 'PII' : role}
        </span>
      </div>
      {useTextarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          rows={2}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: 13,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            background: theme.inputBg,
            color: theme.textPrimary,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: 13,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            background: theme.inputBg,
            color: theme.textPrimary,
            outline: 'none',
          }}
        />
      )}
    </div>
  );
}

function NumberField({
  theme,
  label,
  value,
  onChange,
  busy,
}: {
  theme: ThemeTokens;
  label: string;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 12,
          color: theme.textSecondary,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
        className="tabular"
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: 13,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          background: theme.inputBg,
          color: theme.textPrimary,
          outline: 'none',
        }}
      />
    </div>
  );
}
