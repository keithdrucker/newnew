import { useState, type KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface DraggableColumnItem {
  key: string;
  label: string;
  alwaysVisible?: boolean;
}

interface Props {
  items: DraggableColumnItem[];
  onReorder: (nextKeys: string[]) => void;
  onHide: (key: string) => void;
}

/**
 * Renders a vertically reorderable list of "visible columns" used by
 * the Tickets and Operational Tasks Edit Columns popovers.
 *
 * Uses the native HTML5 drag-and-drop API so we don't have to pull in
 * a dnd library for this single, low-frequency interaction. The grip
 * handle on each row is a real button so keyboard users can press
 * ArrowUp/ArrowDown to move the row without touching the mouse — that
 * keeps us accessible even though native HTML5 dnd itself isn't.
 *
 * Drop targets:
 *   - each row → insert dragged item *before* that row
 *   - a trailing zone at the bottom → move dragged item to the end
 *
 * Drop-on-self is a no-op.
 */
export function DraggableColumnList({ items, onReorder, onHide }: Props) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [overEnd, setOverEnd] = useState(false);

  function moveBefore(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const keys = items.map((i) => i.key);
    const fromIdx = keys.indexOf(fromKey);
    if (fromIdx === -1) return;
    const [moved] = keys.splice(fromIdx, 1);
    // Recompute target index *after* the splice so insertion lands
    // correctly whether the move was upward or downward.
    const toIdx = keys.indexOf(toKey);
    if (toIdx === -1) return;
    keys.splice(toIdx, 0, moved);
    onReorder(keys);
  }

  function moveToEnd(fromKey: string) {
    const keys = items.map((i) => i.key);
    const fromIdx = keys.indexOf(fromKey);
    if (fromIdx === -1 || fromIdx === keys.length - 1) return;
    const [moved] = keys.splice(fromIdx, 1);
    keys.push(moved);
    onReorder(keys);
  }

  function moveByDelta(fromKey: string, delta: -1 | 1) {
    const keys = items.map((i) => i.key);
    const fromIdx = keys.indexOf(fromKey);
    if (fromIdx === -1) return;
    const toIdx = fromIdx + delta;
    if (toIdx < 0 || toIdx >= keys.length) return;
    [keys[fromIdx], keys[toIdx]] = [keys[toIdx], keys[fromIdx]];
    onReorder(keys);
  }

  function handleHandleKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: string) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveByDelta(key, -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveByDelta(key, 1);
    }
  }

  return (
    <>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isDragging = draggingKey === item.key;
          const isOver =
            overKey === item.key &&
            draggingKey !== null &&
            draggingKey !== item.key;
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60",
                isDragging && "opacity-50",
                isOver && "bg-muted ring-1 ring-primary/40",
              )}
              draggable
              onDragStart={(e) => {
                setDraggingKey(item.key);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", item.key);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overKey !== item.key) setOverKey(item.key);
              }}
              onDragLeave={() => {
                if (overKey === item.key) setOverKey(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromKey =
                  draggingKey ?? e.dataTransfer.getData("text/plain");
                if (fromKey) moveBefore(fromKey, item.key);
                setDraggingKey(null);
                setOverKey(null);
                setOverEnd(false);
              }}
              onDragEnd={() => {
                setDraggingKey(null);
                setOverKey(null);
                setOverEnd(false);
              }}
              data-testid={`column-row-${item.key}`}
            >
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                aria-label={`Reorder ${item.label}. Use arrow keys or drag to move.`}
                onKeyDown={(e) => handleHandleKeyDown(e, item.key)}
                data-testid={`column-drag-handle-${item.key}`}
              >
                <GripVertical className="h-4 w-4" aria-hidden />
              </button>
              <Checkbox
                checked
                disabled={item.alwaysVisible}
                onCheckedChange={(v) => {
                  if (item.alwaysVisible) return;
                  if (!v) onHide(item.key);
                }}
                data-testid={`column-toggle-${item.key}`}
              />
              <span className="flex-1 truncate">{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Trailing drop zone so users can drop a row at the very end
          in a single gesture. Only shown while a drag is in progress
          to keep the popover compact when idle. */}
      {draggingKey !== null && (
        <div
          className={cn(
            "h-6 mt-1 rounded border border-dashed text-xs flex items-center justify-center text-muted-foreground transition-colors",
            overEnd ? "border-primary bg-muted text-foreground" : "border-muted",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (!overEnd) setOverEnd(true);
          }}
          onDragLeave={() => setOverEnd(false)}
          onDrop={(e) => {
            e.preventDefault();
            const fromKey =
              draggingKey ?? e.dataTransfer.getData("text/plain");
            if (fromKey) moveToEnd(fromKey);
            setDraggingKey(null);
            setOverKey(null);
            setOverEnd(false);
          }}
          data-testid="column-drop-end"
        >
          Drop here to move to end
        </div>
      )}
    </>
  );
}
