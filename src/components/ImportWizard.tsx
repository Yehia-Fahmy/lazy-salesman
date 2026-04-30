import { useEffect, useMemo, useState } from 'react';
import {
  autoDetectRoles,
  buildComposedAddress,
  headerSignature,
  makeStopFromRow,
  parseCsv,
} from '@/lib/csv';
import { defaultLabelTemplate, renderLabel } from '@/lib/labelTemplate';
import { db } from '@/lib/db';
import { geocodeWithCache } from '@/lib/geocodeCache';
import { useProjectStore } from '@/store/useProjectStore';
import type { ColumnDef, ColumnRole, ImportTemplate, Stop, ThemeTokens } from '@/types';

const ROLES: ColumnRole[] = [
  'address_street',
  'address_line2',
  'address_city',
  'address_region',
  'address_postal',
  'address_country',
  'address_full',
  'label',
  'info',
  'sensitive',
  'ignore',
];

const ROLE_LABELS: Record<ColumnRole, string> = {
  address_street: 'Street',
  address_line2: 'Line 2',
  address_city: 'City',
  address_region: 'State/Province',
  address_postal: 'Postal/Zip',
  address_country: 'Country',
  address_full: 'Full Address',
  label: 'Label (pin title)',
  info: 'Info (popup)',
  sensitive: 'Sensitive (hidden)',
  ignore: 'Ignore',
};

interface PreviewGeo {
  rowIndex: number;
  ok: boolean;
  status: 'ok' | 'low_confidence' | 'failed';
  confidence: number;
  composedAddress: string;
  reason?: string;
  lat: number;
  lng: number;
}

interface ImportWizardProps {
  theme: ThemeTokens;
  file: File;
  token: string;
  onClose: () => void;
}

export function ImportWizard({ theme, file, token, onClose }: ImportWizardProps) {
  const setProject = useProjectStore((s) => s.setProject);
  const project = useProjectStore((s) => s.project);
  const initProject = useProjectStore((s) => s.initProject);

  const [step, setStep] = useState(1);
  const [parseError, setParseError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [duplicatesRenamed, setDuplicatesRenamed] = useState<string[]>([]);
  const [schema, setSchema] = useState<ColumnDef[]>([]);
  const [labelTemplate, setLabelTemplate] = useState('');
  const [previewGeos, setPreviewGeos] = useState<PreviewGeo[] | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [previewStarted, setPreviewStarted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [matchedTemplate, setMatchedTemplate] = useState<ImportTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');

  const sampleRows = useMemo(() => rows.slice(0, 5), [rows]);
  const previewRowCount = sampleRows.length;

  // Parse CSV on mount
  useEffect(() => {
    let cancelled = false;
    parseCsv(file)
      .then((res) => {
        if (cancelled) return;
        setHeaders(res.headers);
        setRows(res.rows);
        setDuplicatesRenamed(res.duplicatesRenamed);

        const sig = headerSignature(res.headers);
        db.importTemplates
          .where('header_signature')
          .equals(sig)
          .first()
          .then((tmpl) => {
            if (cancelled) return;
            if (tmpl) {
              setMatchedTemplate(tmpl);
              setSchema(tmpl.column_schema);
              setLabelTemplate(tmpl.label_template);
            } else {
              const detected = autoDetectRoles(res.headers, res.rows);
              setSchema(detected);
              setLabelTemplate(defaultLabelTemplate(detected));
            }
          });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setParseError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Geocode preview when entering step 4
  useEffect(() => {
    if (step !== 4) {
      setPreviewStarted(false);
      return;
    }
    if (previewStarted) return;
    setPreviewStarted(true);
    setGeocoding(true);
    void runPreview();

    async function runPreview() {
      const out: PreviewGeo[] = [];
      for (let i = 0; i < sampleRows.length; i++) {
        const row = sampleRows[i];
        if (!row) continue;
        const addr = buildComposedAddress(row, schema);
        try {
          const r = await geocodeWithCache(addr, token);
          out.push({
            rowIndex: i,
            ok: r.status === 'ok',
            status: r.status,
            confidence: r.confidence,
            composedAddress: addr,
            ...(r.reason !== undefined ? { reason: r.reason } : {}),
            lat: r.lat,
            lng: r.lng,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          out.push({
            rowIndex: i,
            ok: false,
            status: 'failed',
            confidence: 0,
            composedAddress: addr,
            reason: msg,
            lat: 0,
            lng: 0,
          });
        }
      }
      setPreviewGeos(out);
      setGeocoding(false);
    }
  }, [step, previewStarted, sampleRows, schema, token]);

  const finalize = async (alsoSaveTemplate: boolean): Promise<void> => {
    setImporting(true);
    try {
      // Ensure project exists
      let proj = project;
      if (!proj) {
        initProject(file.name.replace(/\.csv$/i, ''));
        proj = useProjectStore.getState().project;
      }
      if (!proj) {
        setImporting(false);
        return;
      }

      const previewLookup = new Map<number, PreviewGeo>();
      previewGeos?.forEach((g) => previewLookup.set(g.rowIndex, g));

      const stops: Stop[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        let geo = previewLookup.get(i);
        if (!geo) {
          const addr = buildComposedAddress(row, schema);
          try {
            const r = await geocodeWithCache(addr, token);
            geo = {
              rowIndex: i,
              ok: r.status === 'ok',
              status: r.status,
              confidence: r.confidence,
              composedAddress: addr,
              ...(r.reason !== undefined ? { reason: r.reason } : {}),
              lat: r.lat,
              lng: r.lng,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            geo = {
              rowIndex: i,
              ok: false,
              status: 'failed',
              confidence: 0,
              composedAddress: addr,
              reason: msg,
              lat: 0,
              lng: 0,
            };
          }
        }
        const stop = makeStopFromRow(
          row,
          schema,
          {
            lat: geo.lat,
            lng: geo.lng,
            status: geo.status,
            confidence: geo.confidence,
            ...(geo.reason !== undefined ? { reason: geo.reason } : {}),
          },
          `stop-${proj.id}-${i + 1}`,
        );
        stops.push(stop);
      }

      const updated = {
        ...proj,
        column_schema: schema,
        label_template: labelTemplate,
        stops,
        updated_at: new Date().toISOString(),
      };
      setProject(updated);

      if (alsoSaveTemplate && templateName.trim()) {
        const tmpl: ImportTemplate = {
          id: matchedTemplate?.id ?? `tmpl-${Date.now()}`,
          name: templateName.trim(),
          created_at: matchedTemplate?.created_at ?? new Date().toISOString(),
          header_signature: headerSignature(headers),
          column_schema: schema,
          label_template: labelTemplate,
        };
        await db.importTemplates.put(tmpl);
      }

      onClose();
    } finally {
      setImporting(false);
    }
  };

  const stepNames = ['Upload', 'Map Columns', 'Label', 'Preview', 'Template'];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !importing) onClose();
      }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          background: theme.chrome,
          borderRadius: 10,
          width: 720,
          maxHeight: '88vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          border: `1px solid ${theme.border}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}` }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>
              Import CSV
            </div>
            <div style={{ fontSize: 12, color: theme.textTertiary, marginTop: 2 }}>
              {file.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            style={{
              background: 'none',
              border: 'none',
              cursor: importing ? 'not-allowed' : 'pointer',
              color: theme.textTertiary,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div
          className="flex"
          style={{ padding: '12px 24px', borderBottom: `1px solid ${theme.border}` }}
        >
          {stepNames.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div
                key={label}
                className="flex items-center"
                style={{ flex: i < stepNames.length - 1 ? 1 : 'none' }}
              >
                <div
                  className="flex items-center gap-1.5"
                  style={{ cursor: done ? 'pointer' : 'default' }}
                  onClick={() => done && setStep(n)}
                >
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: done || active ? theme.accent : theme.hoverBg,
                      color: done || active ? '#fff' : theme.textTertiary,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {done ? '✓' : n}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: active ? theme.textPrimary : theme.textTertiary,
                      fontWeight: active ? 500 : 400,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                </div>
                {i < stepNames.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: theme.border,
                      margin: '0 8px',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
          {parseError && (
            <div
              style={{
                padding: 12,
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                borderRadius: 6,
              }}
            >
              Could not parse CSV: {parseError}
            </div>
          )}

          {!parseError && step === 1 && (
            <Step1Upload
              theme={theme}
              headers={headers}
              rows={sampleRows}
              duplicatesRenamed={duplicatesRenamed}
              matchedTemplate={matchedTemplate}
            />
          )}
          {!parseError && step === 2 && (
            <Step2Mapping theme={theme} schema={schema} onChange={setSchema} />
          )}
          {!parseError && step === 3 && (
            <Step3Label
              theme={theme}
              schema={schema}
              labelTemplate={labelTemplate}
              setLabelTemplate={setLabelTemplate}
              sampleRows={sampleRows}
            />
          )}
          {!parseError && step === 4 && (
            <Step4Preview
              theme={theme}
              previewRowCount={previewRowCount}
              geocoding={geocoding}
              previewGeos={previewGeos}
              schema={schema}
              labelTemplate={labelTemplate}
              sampleRows={sampleRows}
            />
          )}
          {!parseError && step === 5 && (
            <Step5Template
              theme={theme}
              templateName={templateName}
              setTemplateName={setTemplateName}
              matchedTemplate={matchedTemplate}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '14px 24px', borderTop: `1px solid ${theme.border}` }}
        >
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((s) => s - 1) : onClose())}
            disabled={importing}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 500,
              color: theme.textSecondary,
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              cursor: importing ? 'not-allowed' : 'pointer',
            }}
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          <div className="flex items-center gap-2">
            {step === 5 && (
              <button
                type="button"
                onClick={() => void finalize(false)}
                disabled={importing}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: theme.textSecondary,
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  cursor: importing ? 'not-allowed' : 'pointer',
                }}
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (parseError) return;
                if (step === 4 && (geocoding || !previewGeos)) return;
                if (step === 5) {
                  void finalize(Boolean(templateName.trim()));
                  return;
                }
                setStep((s) => s + 1);
              }}
              disabled={
                importing ||
                Boolean(parseError) ||
                (step === 4 && (geocoding || !previewGeos))
              }
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background:
                  importing || (step === 4 && (geocoding || !previewGeos))
                    ? theme.textTertiary
                    : theme.accent,
                border: 'none',
                borderRadius: 6,
                cursor:
                  importing || (step === 4 && (geocoding || !previewGeos))
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {importing
                ? 'Importing…'
                : step === 5
                  ? 'Save & Finish'
                  : step === 4
                    ? 'Looks good →'
                    : 'Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Upload & Preview ───────────────────────────────────────────────
function Step1Upload({
  theme,
  headers,
  rows,
  duplicatesRenamed,
  matchedTemplate,
}: {
  theme: ThemeTokens;
  headers: string[];
  rows: Record<string, string>[];
  duplicatesRenamed: string[];
  matchedTemplate: ImportTemplate | null;
}) {
  const previewHeaders = headers.slice(0, 6);
  return (
    <div>
      <p
        style={{
          fontSize: 14,
          color: theme.textSecondary,
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        CSV parsed successfully. Detected {rows.length > 0 ? `${rows.length}+` : '0'}{' '}
        rows and {headers.length} columns.
        {duplicatesRenamed.length > 0
          ? ` ${duplicatesRenamed.length} duplicate column header${
              duplicatesRenamed.length === 1 ? '' : 's'
            } renamed.`
          : ''}
      </p>
      <div
        style={{
          overflowX: 'auto',
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: theme.sidebar }}>
              {previewHeaders.map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '7px 10px',
                    textAlign: 'left',
                    color: theme.textSecondary,
                    fontWeight: 500,
                    borderBottom: `1px solid ${theme.border}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h.length > 22 ? `${h.slice(0, 22)}…` : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                {previewHeaders.map((h) => {
                  const v = row[h] ?? '';
                  return (
                    <td
                      key={h}
                      style={{
                        padding: '6px 10px',
                        color: theme.textPrimary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 180,
                      }}
                    >
                      {v.length > 40 ? `${v.slice(0, 40)}…` : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(duplicatesRenamed.length > 0 || matchedTemplate) && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: '#F0FDF4',
            borderRadius: 6,
            fontSize: 12,
            color: '#166534',
          }}
        >
          {matchedTemplate && (
            <div>
              ✓ Matched template <strong>"{matchedTemplate.name}"</strong> from a previous
              upload — column mappings and label template prefilled.
            </div>
          )}
          {duplicatesRenamed.map((n) => (
            <div key={n}>✓ Duplicate column renamed to "{n}"</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Column mapping ──────────────────────────────────────────────────
function Step2Mapping({
  theme,
  schema,
  onChange,
}: {
  theme: ThemeTokens;
  schema: ColumnDef[];
  onChange: (next: ColumnDef[]) => void;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 13,
          color: theme.textSecondary,
          marginBottom: 14,
          marginTop: 0,
        }}
      >
        Auto-detected column roles below. Confirm or adjust as needed. Sensitive
        columns (PII) are never sent to the geocoder.
      </p>
      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 180px',
            background: theme.sidebar,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              padding: '7px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: theme.textTertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Column
          </div>
          <div
            style={{
              padding: '7px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: theme.textTertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Role
          </div>
        </div>
        {schema.map((col, idx) => (
          <div
            key={col.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 180px',
              borderBottom: idx < schema.length - 1 ? `1px solid ${theme.border}` : 'none',
              background: col.role === 'ignore' ? theme.sidebar : 'transparent',
            }}
          >
            <div className="flex items-center gap-1.5" style={{ padding: '7px 12px' }}>
              {col.sensitive && (
                <span
                  style={{
                    fontSize: 10,
                    background: '#FEF2F2',
                    color: '#DC2626',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontWeight: 600,
                  }}
                >
                  PII
                </span>
              )}
              <span
                title={col.name}
                style={{
                  fontSize: 13,
                  color: col.role === 'ignore' ? theme.textTertiary : theme.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.name}
              </span>
            </div>
            <div style={{ padding: '4px 12px' }}>
              <select
                value={col.role}
                onChange={(e) => {
                  const role = e.target.value as ColumnRole;
                  const next = schema.map((c, i) => (i === idx ? { ...c, role } : c));
                  onChange(next);
                }}
                style={{
                  width: '100%',
                  fontSize: 12,
                  padding: '4px 6px',
                  background: theme.inputBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 4,
                  color: theme.textPrimary,
                  cursor: 'pointer',
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 3: Label template ──────────────────────────────────────────────────
function Step3Label({
  theme,
  schema,
  labelTemplate,
  setLabelTemplate,
  sampleRows,
}: {
  theme: ThemeTokens;
  schema: ColumnDef[];
  labelTemplate: string;
  setLabelTemplate: (s: string) => void;
  sampleRows: Record<string, string>[];
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 13,
          color: theme.textSecondary,
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        The label template defines what appears as the pin title on the map. Use{' '}
        <code style={codeChip(theme)}>{'{Column Name}'}</code> placeholders.
      </p>
      <label
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: theme.textPrimary,
          display: 'block',
          marginBottom: 8,
        }}
      >
        Label template
      </label>
      <input
        value={labelTemplate}
        onChange={(e) => setLabelTemplate(e.target.value)}
        style={{
          width: '100%',
          padding: '9px 12px',
          fontSize: 14,
          border: `1px solid ${theme.accent}`,
          borderRadius: 6,
          background: theme.inputBg,
          color: theme.textPrimary,
          outline: 'none',
        }}
      />
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: theme.textTertiary, marginBottom: 6 }}>
          Available columns — click to insert
        </div>
        <div className="flex flex-wrap gap-1.5">
          {schema
            .filter((c) => c.role !== 'ignore')
            .map((col) => (
              <button
                key={col.name}
                type="button"
                onClick={() => setLabelTemplate(`${labelTemplate}{${col.name}}`)}
                style={{
                  padding: '3px 9px',
                  fontSize: 12,
                  background: col.sensitive ? '#FEF2F2' : theme.hoverBg,
                  color: col.sensitive ? '#DC2626' : theme.textSecondary,
                  border: `1px solid ${col.sensitive ? '#FCA5A5' : theme.border}`,
                  borderRadius: 99,
                  cursor: 'pointer',
                }}
              >
                {col.name}
              </button>
            ))}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: theme.textTertiary, marginBottom: 8 }}>
          Preview
        </div>
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {sampleRows.map((row, i) => {
            const rendered = renderLabel(labelTemplate, row, '(no label)');
            return (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  borderBottom: i < sampleRows.length - 1 ? `1px solid ${theme.border}` : 'none',
                  color: theme.textPrimary,
                }}
              >
                {rendered || <span style={{ color: theme.textTertiary }}>(empty)</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Geocode preview ─────────────────────────────────────────────────
function Step4Preview({
  theme,
  previewRowCount,
  geocoding,
  previewGeos,
  schema,
  labelTemplate,
  sampleRows,
}: {
  theme: ThemeTokens;
  previewRowCount: number;
  geocoding: boolean;
  previewGeos: PreviewGeo[] | null;
  schema: ColumnDef[];
  labelTemplate: string;
  sampleRows: Record<string, string>[];
}) {
  if (geocoding || !previewGeos) {
    return (
      <div className="text-center" style={{ padding: '40px 0' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🗺️</div>
        <div style={{ fontSize: 14, color: theme.textPrimary, fontWeight: 500 }}>
          Geocoding {previewRowCount} address{previewRowCount === 1 ? '' : 'es'}…
        </div>
        <div style={{ fontSize: 12, color: theme.textTertiary, marginTop: 6 }}>
          Sending to Mapbox
        </div>
      </div>
    );
  }
  const okCount = previewGeos.filter((g) => g.status === 'ok').length;
  const issueCount = previewGeos.length - okCount;

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: '10px 12px',
          background: issueCount === 0 ? '#F0FDF4' : '#FFFBEB',
          borderRadius: 6,
          fontSize: 12,
          color: issueCount === 0 ? '#166534' : '#92400E',
        }}
      >
        ✓ {okCount} of {previewGeos.length} geocoded successfully
        {issueCount > 0 ? ` · ${issueCount} need${issueCount === 1 ? 's' : ''} attention` : ''}
      </div>
      {previewGeos.map((g) => {
        const row = sampleRows[g.rowIndex];
        const label = row ? renderLabel(labelTemplate, row, g.composedAddress) : '';
        return (
          <div
            key={g.rowIndex}
            className="flex items-center gap-3"
            style={{
              padding: '10px 12px',
              marginBottom: 6,
              border: `1px solid ${g.ok ? theme.border : '#FCA5A5'}`,
              borderRadius: 6,
              background: g.ok ? 'transparent' : '#FFF5F5',
            }}
          >
            <div
              className="flex-shrink-0"
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: g.ok ? '#16A34A' : '#DC2626',
              }}
            />
            <div className="flex-1 min-w-0">
              <div
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
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: theme.textSecondary,
                  marginTop: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {g.composedAddress}
              </div>
              {!g.ok && g.reason && (
                <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>
                  {g.reason}
                </div>
              )}
            </div>
            <div
              className="tabular"
              style={{
                fontSize: 11,
                color: g.ok ? '#16A34A' : '#DC2626',
                fontWeight: 500,
              }}
            >
              {g.ok ? `${Math.round(g.confidence * 100)}%` : '⚠'}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 4 }}>
        On "Save & Finish" the rest of the rows will be geocoded too.{' '}
        Schema fields used: {schema.filter((c) => c.role.startsWith('address_')).map((c) => c.name).join(', ') || 'none'}
      </div>
    </div>
  );
}

// ── Step 5: Save template ───────────────────────────────────────────────────
function Step5Template({
  theme,
  templateName,
  setTemplateName,
  matchedTemplate,
}: {
  theme: ThemeTokens;
  templateName: string;
  setTemplateName: (s: string) => void;
  matchedTemplate: ImportTemplate | null;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 13,
          color: theme.textSecondary,
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        {matchedTemplate
          ? `This upload matched the "${matchedTemplate.name}" template. Save changes back to that template, rename, or skip.`
          : 'Save these column mappings as a template so future uploads with the same form skip the wizard automatically.'}
      </p>
      <label
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: theme.textPrimary,
          display: 'block',
          marginBottom: 8,
        }}
      >
        Template name
      </label>
      <input
        value={templateName}
        onChange={(e) => setTemplateName(e.target.value)}
        placeholder={matchedTemplate?.name ?? 'e.g. Weekly delivery form'}
        style={{
          width: '100%',
          padding: '9px 12px',
          fontSize: 14,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          background: theme.inputBg,
          color: theme.textPrimary,
          outline: 'none',
        }}
      />
      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          background: theme.hoverBg,
          borderRadius: 6,
          fontSize: 12,
          color: theme.textSecondary,
        }}
      >
        Templates are matched by header signature. Future uploads of the same form
        will offer a one-click "Use this template" option.
      </div>
    </div>
  );
}

function codeChip(theme: ThemeTokens): React.CSSProperties {
  return {
    background: theme.hoverBg,
    padding: '1px 4px',
    borderRadius: 3,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: 12,
  };
}
