import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { stopLabel } from '@/lib/labelTemplate';
import type { Depot, Route, Stop, ThemeTokens } from '@/types';

interface RoutePanelProps {
  theme: ThemeTokens;
  route: Route;
  stops: Stop[];
  depots: Depot[];
  labelTemplate: string;
  onRename: (name: string) => void;
  onChangeStartDepot: (depotId: string | undefined) => void;
  onChangeEndDepot: (depotId: string | undefined) => void;
  onToggleLoop: () => void;
  onReorder: (stopIds: string[]) => void;
  onRemoveStop: (stopId: string) => void;
  onDone: () => void;
  onDelete: () => void;
}

export function RoutePanel({
  theme,
  route,
  stops,
  depots,
  labelTemplate,
  onRename,
  onChangeStartDepot,
  onChangeEndDepot,
  onToggleLoop,
  onReorder,
  onRemoveStop,
  onDone,
  onDelete,
}: RoutePanelProps) {
  const routeStops = route.stop_ids
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is Stop => Boolean(s));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = route.stop_ids.indexOf(active.id as string);
    const newIndex = route.stop_ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(route.stop_ids, oldIndex, newIndex));
  };

  return (
    <div className="flex flex-col" style={{ padding: '12px 0', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-2" style={{ padding: '0 16px 10px' }}>
        <div
          style={{ width: 12, height: 12, borderRadius: '50%', background: route.color }}
        />
        <input
          value={route.name}
          onChange={(e) => onRename(e.target.value)}
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: theme.textPrimary,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
          }}
        />
        <span style={{ fontSize: 11, color: theme.textTertiary }}>editing</span>
      </div>

      {/* ETA summary */}
      <div
        className="flex items-center gap-4"
        style={{
          margin: '0 16px 10px',
          padding: '7px 10px',
          background: theme.hoverBg,
          borderRadius: 6,
        }}
      >
        <Stat theme={theme} value={route.total_minutes} label="min" />
        <Bar theme={theme} />
        <Stat theme={theme} value={route.total_km} label="km" />
        <Bar theme={theme} />
        <Stat theme={theme} value={routeStops.length} label="stops" />
      </div>

      {/* Depot pickers */}
      <DepotSelectRow
        theme={theme}
        label="Start"
        depots={depots}
        value={route.start_depot_id}
        onChange={onChangeStartDepot}
      />
      <DepotSelectRow
        theme={theme}
        label="End"
        depots={depots}
        value={route.end_depot_id}
        onChange={onChangeEndDepot}
      />

      {/* Stop list */}
      <div className="overflow-y-auto" style={{ flex: 1, padding: '4px 0', minHeight: 0 }}>
        {routeStops.length === 0 ? (
          <div style={{ padding: '12px 16px', fontSize: 13, color: theme.textTertiary }}>
            Click pins on the map to add stops.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={route.stop_ids} strategy={verticalListSortingStrategy}>
              {routeStops.map((stop, i) => (
                <SortableRow
                  key={stop.id}
                  id={stop.id}
                  index={i + 1}
                  label={stopLabel(stop, labelTemplate)}
                  onRemove={() => onRemoveStop(stop.id)}
                  theme={theme}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Loop toggle */}
      <div className="flex items-center gap-2" style={{ padding: '8px 16px' }}>
        <label
          className="flex items-center gap-1.5 cursor-pointer"
          style={{ fontSize: 13, color: theme.textSecondary }}
        >
          <input
            type="checkbox"
            checked={route.is_loop}
            onChange={onToggleLoop}
            style={{ accentColor: theme.accent }}
          />
          Loop (return to start depot)
        </label>
      </div>

      {/* Done / Delete */}
      <div className="flex gap-2" style={{ padding: '4px 16px 8px' }}>
        <button
          type="button"
          onClick={onDelete}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            color: '#DC2626',
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onDone}
          style={{
            flex: 1,
            padding: '8px 0',
            background: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ✓ Done editing
        </button>
      </div>
    </div>
  );
}

function Stat({
  theme,
  value,
  label,
}: {
  theme: ThemeTokens;
  value: number;
  label: string;
}) {
  return (
    <div className="text-center">
      <div
        className="tabular"
        style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: theme.textTertiary,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Bar({ theme }: { theme: ThemeTokens }) {
  return <div style={{ width: 1, height: 28, background: theme.border }} />;
}

function DepotSelectRow({
  theme,
  label,
  depots,
  value,
  onChange,
}: {
  theme: ThemeTokens;
  label: string;
  depots: Depot[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2" style={{ padding: '4px 16px' }}>
      <div
        style={{
          width: 10,
          height: 10,
          background: '#18181B',
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: theme.textTertiary, width: 36 }}>{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{
          flex: 1,
          fontSize: 12,
          color: theme.textPrimary,
          background: theme.inputBg,
          border: `1px solid ${theme.border}`,
          borderRadius: 4,
          padding: '3px 6px',
          cursor: 'pointer',
        }}
      >
        <option value="">— None —</option>
        {depots.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SortableRowProps {
  id: string;
  index: number;
  label: string;
  onRemove: () => void;
  theme: ThemeTokens;
}

function SortableRow({ id, index, label, onRemove, theme }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? theme.hoverBg : 'transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 16px',
    cursor: 'grab',
    userSelect: 'none',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <span style={{ fontSize: 11, color: theme.textTertiary, marginRight: 2 }}>⠿</span>
      <span
        className="tabular"
        style={{
          fontSize: 11,
          color: theme.textTertiary,
          width: 16,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {index}
      </span>
      <span
        style={{
          fontSize: 12,
          color: theme.textPrimary,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Remove stop ${index}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          color: theme.textTertiary,
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
