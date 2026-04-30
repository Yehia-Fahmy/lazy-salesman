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
import { PinPopup } from '@/components/PinPopup';
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

type UnresolvedAction = 'edit' | 'remove' | 'keep';

interface UnresolvedChoice {
  action: UnresolvedAction;
  editedAddress: string;
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
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [labelTemplate, setLabelTemplate] = useState('');
  const [previewGeos, setPreviewGeos] = useState<PreviewGeo[] | null>(null);
  const [unresolvedChoices, setUnresolvedChoices] = useState<Record<number, UnresolvedChoice>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [previewStarted, setPreviewStarted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [matchedTemplate, setMatchedTemplate] = useState<ImportTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');

  const selectedSchema = useMemo(
    () => schema.filter((col) => selectedColumns.has(col.name)),
    [schema, selectedColumns],
  );
  const selectedRowList = useMemo(
    () => [...selectedRowIndices].sort((a, b) => a - b),
    [selectedRowIndices],
  );

  // Parse CSV on mount
  useEffect(() => {
    let cancelled = false;
    parseCsv(file)
      .then((res) => {
        if (cancelled) return;
        setHeaders(res.headers);
        setRows(res.rows);
        setDuplicatesRenamed(res.duplicatesRenamed);
        setSelectedColumns(new Set(res.headers));
        setSelectedRowIndices(new Set(res.rows.map((_, idx) => idx)));

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

  useEffect(() => {
    setUnresolvedChoices({});
  }, [step, selectedRowIndices, selectedSchema]);

  // Geocode preview when entering step 3
  useEffect(() => {
    if (step !== 3) {
      setPreviewStarted(false);
      return;
    }
    if (previewStarted) return;
    setPreviewStarted(true);
    setGeocoding(true);
    void runPreview();

    async function runPreview() {
      const out: PreviewGeo[] = [];
      for (const rowIndex of selectedRowList) {
        const row = rows[rowIndex];
        if (!row) continue;
        const addr = buildComposedAddress(row, selectedSchema);
        try {
          const r = await geocodeWithCache(addr, token);
          out.push({
            rowIndex,
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
            rowIndex,
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
      const nextChoices: Record<number, UnresolvedChoice> = {};
      out
        .filter((g) => g.status !== 'ok')
        .forEach((g) => {
          nextChoices[g.rowIndex] = { action: 'keep', editedAddress: g.composedAddress };
        });
      setUnresolvedChoices(nextChoices);
      setGeocoding(false);
    }
  }, [rows, step, previewStarted, selectedRowList, selectedSchema, token]);

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
      let importedCount = 0;
      for (let i = 0; i < rows.length; i++) {
        if (!selectedRowIndices.has(i)) continue;
        const row = rows[i];
        if (!row) continue;
        const unresolvedChoice = unresolvedChoices[i];
        if (unresolvedChoice?.action === 'remove') continue;
        let geo = previewLookup.get(i);
        if (unresolvedChoice?.action === 'edit') {
          const editedAddress = unresolvedChoice.editedAddress.trim();
          if (!editedAddress) continue;
          try {
            const r = await geocodeWithCache(editedAddress, token);
            geo = {
              rowIndex: i,
              ok: r.status === 'ok',
              status: r.status,
              confidence: r.confidence,
              composedAddress: editedAddress,
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
              composedAddress: editedAddress,
              reason: msg,
              lat: 0,
              lng: 0,
            };
          }
        }
        if (!geo) {
          const addr = buildComposedAddress(row, selectedSchema);
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
          selectedSchema,
          {
            lat: geo.lat,
            lng: geo.lng,
            status: geo.status,
            confidence: geo.confidence,
            ...(geo.reason !== undefined ? { reason: geo.reason } : {}),
          },
          `stop-${proj.id}-${importedCount + 1}`,
        );
        importedCount += 1;
        stops.push(stop);
      }

      const updated = {
        ...proj,
        column_schema: selectedSchema,
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
          column_schema: selectedSchema,
          label_template: labelTemplate,
        };
        await db.importTemplates.put(tmpl);
      }

      onClose();
    } finally {
      setImporting(false);
    }
  };

  const stepNames = ['Upload', 'Select Data', 'Preview', 'Template'];
  const unresolvedWithEditErrors = Object.values(unresolvedChoices).some(
    (choice) => choice.action === 'edit' && !choice.editedAddress.trim(),
  );
  const selectedCountAfterPreviewRemovals =
    step === 3
      ? selectedRowList.filter((idx) => unresolvedChoices[idx]?.action !== 'remove').length
      : selectedRowIndices.size;

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
              rows={rows.slice(0, 5)}
              rowCount={rows.length}
              duplicatesRenamed={duplicatesRenamed}
              matchedTemplate={matchedTemplate}
            />
          )}
          {!parseError && step === 2 && (
            <Step2SelectData
              theme={theme}
              schema={schema}
              selectedColumns={selectedColumns}
              onSelectedColumnsChange={setSelectedColumns}
              selectedRowIndices={selectedRowIndices}
              onSelectedRowIndicesChange={setSelectedRowIndices}
              rows={rows}
              onSchemaChange={setSchema}
              labelTemplate={labelTemplate}
              setLabelTemplate={setLabelTemplate}
            />
          )}
          {!parseError && step === 3 && (
            <Step3Preview
              theme={theme}
              previewRowCount={selectedRowIndices.size}
              geocoding={geocoding}
              previewGeos={previewGeos}
              schema={selectedSchema}
              labelTemplate={labelTemplate}
              rows={rows}
              unresolvedChoices={unresolvedChoices}
              onUnresolvedChoicesChange={setUnresolvedChoices}
            />
          )}
          {!parseError && step === 4 && (
            <Step4Template
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
            {step === 4 && (
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
                if (step === 2 && selectedColumns.size === 0) return;
                if (step === 2 && selectedRowIndices.size === 0) return;
                if (
                  step === 3 &&
                  (geocoding ||
                    !previewGeos ||
                    unresolvedWithEditErrors ||
                    selectedCountAfterPreviewRemovals === 0)
                )
                  return;
                if (step === 4) {
                  void finalize(Boolean(templateName.trim()));
                  return;
                }
                setStep((s) => s + 1);
              }}
              disabled={
                importing ||
                Boolean(parseError) ||
                (step === 2 && selectedColumns.size === 0) ||
                (step === 2 && selectedRowIndices.size === 0) ||
                (step === 3 &&
                  (geocoding ||
                    !previewGeos ||
                    unresolvedWithEditErrors ||
                    selectedCountAfterPreviewRemovals === 0))
              }
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background:
                  importing ||
                  (step === 3 &&
                    (geocoding ||
                      !previewGeos ||
                      unresolvedWithEditErrors ||
                      selectedCountAfterPreviewRemovals === 0))
                    ? theme.textTertiary
                    : theme.accent,
                border: 'none',
                borderRadius: 6,
                cursor:
                  importing ||
                  (step === 3 &&
                    (geocoding ||
                      !previewGeos ||
                      unresolvedWithEditErrors ||
                      selectedCountAfterPreviewRemovals === 0))
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {importing
                ? 'Importing…'
                : step === 4
                  ? 'Save & Finish'
                  : step === 3
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
  rowCount,
  duplicatesRenamed,
  matchedTemplate,
}: {
  theme: ThemeTokens;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
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
        CSV parsed successfully. Detected {rowCount}{' '}
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

// ── Step 2: Select rows/columns and label preview ───────────────────────────
function Step2SelectData({
  theme,
  schema,
  selectedColumns,
  onSelectedColumnsChange,
  selectedRowIndices,
  onSelectedRowIndicesChange,
  rows,
  onSchemaChange,
  labelTemplate,
  setLabelTemplate,
}: {
  theme: ThemeTokens;
  schema: ColumnDef[];
  selectedColumns: Set<string>;
  onSelectedColumnsChange: (next: Set<string>) => void;
  selectedRowIndices: Set<number>;
  onSelectedRowIndicesChange: (next: Set<number>) => void;
  rows: Record<string, string>[];
  onSchemaChange: (next: ColumnDef[]) => void;
  labelTemplate: string;
  setLabelTemplate: (s: string) => void;
}) {
  const visibleRows = rows.slice(0, 80);
  const selectedSchema = useMemo(
    () => schema.filter((col) => selectedColumns.has(col.name)),
    [schema, selectedColumns],
  );
  const previewRowIndices = useMemo(
    () => [...selectedRowIndices].sort((a, b) => a - b),
    [selectedRowIndices],
  );
  const [previewCursor, setPreviewCursor] = useState(0);

  useEffect(() => {
    if (previewRowIndices.length === 0) {
      setPreviewCursor(0);
      return;
    }
    if (previewCursor > previewRowIndices.length - 1) {
      setPreviewCursor(previewRowIndices.length - 1);
    }
  }, [previewCursor, previewRowIndices]);

  const previewRowIndex = previewRowIndices[previewCursor];
  const previewRow = previewRowIndex !== undefined ? rows[previewRowIndex] : undefined;
  const previewStop =
    previewRow && previewRowIndex !== undefined
      ? makeStopFromRow(
          previewRow,
          selectedSchema,
          {
            lat: 0,
            lng: 0,
            status: 'ok',
            confidence: 1,
          },
          `preview-row-${previewRowIndex}`,
        )
      : null;

  const toggleColumn = (name: string, checked: boolean) => {
    const next = new Set(selectedColumns);
    if (checked) next.add(name);
    else next.delete(name);
    onSelectedColumnsChange(next);
  };
  const toggleRow = (rowIndex: number, checked: boolean) => {
    const next = new Set(selectedRowIndices);
    if (checked) next.add(rowIndex);
    else next.delete(rowIndex);
    onSelectedRowIndicesChange(next);
  };

  const allColumnsSelected = schema.length > 0 && schema.every((col) => selectedColumns.has(col.name));
  const selectAllRows = () => {
    onSelectedRowIndicesChange(new Set(rows.map((_, idx) => idx)));
  };
  const deselectAllRows = () => {
    onSelectedRowIndicesChange(new Set());
  };

  return (
    <div className="flex flex-col gap-4">
      <p style={{ fontSize: 13, color: theme.textSecondary, margin: 0 }}>
        Choose the columns and rows to import, then confirm the pin popup preview before moving
        on.
      </p>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div
          className="flex items-center justify-between"
          style={{ background: theme.sidebar, borderBottom: `1px solid ${theme.border}`, padding: '7px 12px' }}
        >
          <div style={{ fontSize: 12, color: theme.textSecondary, fontWeight: 600 }}>
            Columns ({selectedColumns.size}/{schema.length} selected)
          </div>
          <label className="flex items-center gap-1.5" style={{ fontSize: 12, color: theme.textSecondary }}>
            <input
              type="checkbox"
              checked={allColumnsSelected}
              onChange={(e) =>
                onSelectedColumnsChange(e.target.checked ? new Set(schema.map((col) => col.name)) : new Set())
              }
            />
            Select all
          </label>
        </div>
        {schema.map((col, idx) => (
          <div
            key={col.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 180px',
              borderBottom: idx < schema.length - 1 ? `1px solid ${theme.border}` : 'none',
              background: selectedColumns.has(col.name) ? 'transparent' : theme.sidebar,
            }}
          >
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedColumns.has(col.name)}
                onChange={(e) => toggleColumn(col.name, e.target.checked)}
              />
            </div>
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
                  color: selectedColumns.has(col.name) ? theme.textPrimary : theme.textTertiary,
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
                  onSchemaChange(next);
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

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div
          className="flex items-center justify-between"
          style={{ background: theme.sidebar, borderBottom: `1px solid ${theme.border}`, padding: '7px 12px' }}
        >
          <div style={{ fontSize: 12, color: theme.textSecondary, fontWeight: 600 }}>
            Rows ({selectedRowIndices.size}/{rows.length} selected)
          </div>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
            <button
              type="button"
              onClick={selectAllRows}
              style={{
                padding: '2px 8px',
                fontSize: 12,
                color: theme.textSecondary,
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={deselectAllRows}
              style={{
                padding: '2px 8px',
                fontSize: 12,
                color: theme.textSecondary,
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Deselect all
            </button>
          </div>
        </div>
        <div style={{ maxHeight: 220, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: theme.sidebar }}>
                <th style={{ width: 34, borderBottom: `1px solid ${theme.border}` }} />
                <th
                  style={{
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textTertiary,
                    padding: '6px 8px',
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  Row
                </th>
                {schema
                  .filter((col) => selectedColumns.has(col.name))
                  .slice(0, 4)
                  .map((col) => (
                    <th
                      key={col.name}
                      style={{
                        textAlign: 'left',
                        fontWeight: 600,
                        color: theme.textTertiary,
                        padding: '6px 8px',
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      {col.name}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedRowIndices.has(idx)}
                      onChange={(e) => toggleRow(idx, e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', color: theme.textSecondary }}>{idx + 1}</td>
                  {schema
                    .filter((col) => selectedColumns.has(col.name))
                    .slice(0, 4)
                    .map((col) => (
                      <td
                        key={col.name}
                        style={{
                          padding: '6px 8px',
                          color: theme.textPrimary,
                          maxWidth: 160,
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row[col.name] ?? ''}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
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
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
          {schema
            .filter((c) => selectedColumns.has(c.name))
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

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: theme.textTertiary }}>Pin popup preview</div>
          {previewRowIndices.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewCursor((n) => Math.max(0, n - 1))}
                disabled={previewCursor === 0}
                style={{
                  padding: '2px 8px',
                  fontSize: 12,
                  color: previewCursor === 0 ? theme.textTertiary : theme.textSecondary,
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 4,
                  cursor: previewCursor === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Prev
              </button>
              <div style={{ fontSize: 11, color: theme.textTertiary, minWidth: 110, textAlign: 'center' }}>
                Row {previewRowIndex !== undefined ? previewRowIndex + 1 : 0} ({previewCursor + 1}/{previewRowIndices.length})
              </div>
              <button
                type="button"
                onClick={() =>
                  setPreviewCursor((n) => Math.min(previewRowIndices.length - 1, n + 1))
                }
                disabled={previewCursor >= previewRowIndices.length - 1}
                style={{
                  padding: '2px 8px',
                  fontSize: 12,
                  color:
                    previewCursor >= previewRowIndices.length - 1
                      ? theme.textTertiary
                      : theme.textSecondary,
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 4,
                  cursor:
                    previewCursor >= previewRowIndices.length - 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
        <div className="flex justify-center">
          {!previewStop && (
            <div style={{ fontSize: 12, color: theme.textTertiary }}>Select at least one row.</div>
          )}
          {previewStop && (
            <PinPopup
              theme={theme}
              stop={previewStop}
              schema={selectedSchema}
              labelTemplate={labelTemplate}
              routes={[]}
              activeRouteId={null}
              previewMode
              onToggleRouteMembership={() => {}}
              onAddToActiveRoute={() => {}}
              onDeleteStop={() => {}}
              onEditStop={() => {}}
              onClose={() => {}}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Geocode preview ─────────────────────────────────────────────────
function Step3Preview({
  theme,
  previewRowCount,
  geocoding,
  previewGeos,
  schema,
  labelTemplate,
  rows,
  unresolvedChoices,
  onUnresolvedChoicesChange,
}: {
  theme: ThemeTokens;
  previewRowCount: number;
  geocoding: boolean;
  previewGeos: PreviewGeo[] | null;
  schema: ColumnDef[];
  labelTemplate: string;
  rows: Record<string, string>[];
  unresolvedChoices: Record<number, UnresolvedChoice>;
  onUnresolvedChoicesChange: (next: Record<number, UnresolvedChoice>) => void;
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
  const successful = previewGeos.filter((g) => g.status === 'ok');
  const unsuccessful = previewGeos.filter((g) => g.status !== 'ok');
  const okCount = successful.length;
  const issueCount = unsuccessful.length;
  const keptAsIsCount = unsuccessful.filter(
    (g) => unresolvedChoices[g.rowIndex]?.action === 'keep',
  ).length;
  const removedCount = unsuccessful.filter(
    (g) => unresolvedChoices[g.rowIndex]?.action === 'remove',
  ).length;

  const updateChoice = (
    rowIndex: number,
    updater: (prev: UnresolvedChoice) => UnresolvedChoice,
  ) => {
    const current = unresolvedChoices[rowIndex] ?? { action: 'keep', editedAddress: '' };
    onUnresolvedChoicesChange({
      ...unresolvedChoices,
      [rowIndex]: updater(current),
    });
  };

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
      {issueCount > 0 && (
        <div
          style={{
            border: `1px solid #FCA5A5`,
            borderRadius: 6,
            background: '#FFF5F5',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              borderBottom: `1px solid #FCA5A5`,
              fontSize: 12,
              fontWeight: 600,
              color: '#991B1B',
            }}
          >
            Unsuccessful / low-confidence ({issueCount}) · Keep as-is: {keptAsIsCount} · Remove:{' '}
            {removedCount}
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: 8 }}>
            {unsuccessful.map((g) => {
              const row = rows[g.rowIndex];
              if (!row) return null;
              const label = renderLabel(labelTemplate, row, g.composedAddress);
              const choice = unresolvedChoices[g.rowIndex] ?? {
                action: 'keep',
                editedAddress: g.composedAddress,
              };
              return (
                <div
                  key={g.rowIndex}
                  style={{
                    border: '1px solid #FCA5A5',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 8,
                    background: '#fff',
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-3"
                    style={{ marginBottom: 6 }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
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
                        Row {g.rowIndex + 1} · {label}
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
                    </div>
                    <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>
                      {g.status === 'low_confidence' ? 'Low confidence' : 'Failed'}
                    </div>
                  </div>
                  {g.reason && (
                    <div style={{ fontSize: 11, color: '#B91C1C', marginBottom: 8 }}>
                      {g.reason}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 8 }}>
                    <label
                      className="flex items-center gap-1.5"
                      style={{ fontSize: 12, color: theme.textSecondary }}
                    >
                      <input
                        type="radio"
                        name={`unresolved-${g.rowIndex}`}
                        checked={choice.action === 'edit'}
                        onChange={() =>
                          updateChoice(g.rowIndex, (prev) => ({
                            ...prev,
                            action: 'edit',
                            editedAddress: prev.editedAddress || g.composedAddress,
                          }))
                        }
                      />
                      Edit address
                    </label>
                    <label
                      className="flex items-center gap-1.5"
                      style={{ fontSize: 12, color: '#B91C1C' }}
                    >
                      <input
                        type="radio"
                        name={`unresolved-${g.rowIndex}`}
                        checked={choice.action === 'remove'}
                        onChange={() =>
                          updateChoice(g.rowIndex, (prev) => ({
                            ...prev,
                            action: 'remove',
                          }))
                        }
                      />
                      Remove
                    </label>
                    <label
                      className="flex items-center gap-1.5"
                      style={{ fontSize: 12, color: theme.textSecondary }}
                    >
                      <input
                        type="radio"
                        name={`unresolved-${g.rowIndex}`}
                        checked={choice.action === 'keep'}
                        onChange={() =>
                          updateChoice(g.rowIndex, (prev) => ({
                            ...prev,
                            action: 'keep',
                          }))
                        }
                      />
                      Keep as-is
                    </label>
                  </div>
                  {choice.action === 'edit' && (
                    <input
                      value={choice.editedAddress}
                      onChange={(e) =>
                        updateChoice(g.rowIndex, (prev) => ({
                          ...prev,
                          editedAddress: e.target.value,
                        }))
                      }
                      placeholder="Enter a corrected address"
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        fontSize: 12,
                        border: `1px solid ${choice.editedAddress.trim() ? theme.border : '#DC2626'}`,
                        borderRadius: 4,
                        background: theme.inputBg,
                        color: theme.textPrimary,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div
          style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${theme.border}`,
            fontSize: 12,
            fontWeight: 600,
            color: theme.textSecondary,
            background: theme.sidebar,
          }}
        >
          Geocoded successfully ({okCount})
        </div>
        {okCount === 0 && (
          <div style={{ fontSize: 12, color: theme.textTertiary, padding: 12 }}>
            No successful geocodes yet.
          </div>
        )}
        {okCount > 0 && (
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: 8 }}>
            {successful.map((g) => {
              const row = rows[g.rowIndex];
              if (!row) return null;
              const label = renderLabel(labelTemplate, row, g.composedAddress);
              return (
                <div
                  key={g.rowIndex}
                  className="flex items-center gap-3"
                  style={{
                    padding: '8px 10px',
                    marginBottom: 6,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    background: 'transparent',
                  }}
                >
                  <div
                    className="flex-shrink-0"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#16A34A',
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
                      Row {g.rowIndex + 1} · {label}
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
                  </div>
                  <div
                    className="tabular"
                    style={{
                      fontSize: 11,
                      color: '#16A34A',
                      fontWeight: 500,
                    }}
                  >
                    {Math.round(g.confidence * 100)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 4 }}>
        Reviewed {previewGeos.length} selected row{previewGeos.length === 1 ? '' : 's'}. Schema
        fields used:{' '}
        {schema
          .filter((c) => c.role.startsWith('address_'))
          .map((c) => c.name)
          .join(', ') || 'none'}
      </div>
    </div>
  );
}

// ── Step 4: Save template ───────────────────────────────────────────────────
function Step4Template({
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

