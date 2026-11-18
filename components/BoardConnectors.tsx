"use client";

import { useId, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { LiquidSwatches } from "./LiquidSwatches";
import type { Block, BoardConnector, BoardPoint, ConnectorEnd } from "@/lib/types";

const sides = ["left", "right", "top", "bottom"] as const;
type Bounds = { left: number; right: number; top: number; bottom: number };
type Anchors = Map<string, Bounds>;
export function boardAnchors(root: HTMLElement, plane: SVGSVGElement): Anchors {
  const origin = plane.getBoundingClientRect();
  const result: Anchors = new Map();
  if (!origin.width || !origin.height) return result;
  root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((element) => {
    const rect = element.getBoundingClientRect();
    result.set(element.dataset.blockId!, {
      left: (rect.left - origin.left) / origin.width, right: (rect.right - origin.left) / origin.width,
      top: (rect.top - origin.top) / origin.height, bottom: (rect.bottom - origin.top) / origin.height,
    });
  });
  return result;
}

export function resolveEnd(end: ConnectorEnd, anchors: Anchors): BoardPoint {
  const rect = end.objectId && anchors.get(end.objectId);
  if (!rect || !end.side) return end.point;
  return end.side === "left" || end.side === "right"
    ? [rect[end.side], (rect.top + rect.bottom) / 2]
    : [(rect.left + rect.right) / 2, rect[end.side]];
}

const CONNECTOR_COLORS = [["Blue", "#2454e8"], ["Black", "#1f2540"], ["Red", "#d0453b"], ["Green", "#1d9e75"], ["Purple", "#7f5bd6"], ["Orange", "#e08a1e"]] as const;

export function BoardConnectors({ root, plane, blocks, selectedObject, width, height, viewOrigin, enabled, drawing, canEdit, onCancel, onSave, onDelete }: {
  root: RefObject<HTMLDivElement | null>; plane: RefObject<SVGSVGElement | null>;
  blocks: Block[]; selectedObject?: string; width: number; height: number;
  viewOrigin: BoardPoint;
  enabled: boolean; drawing: boolean; onCancel: () => void;
  canEdit?: (id: string) => boolean;
  onSave: (connector: BoardConnector, id?: string) => void; onDelete: (id: string) => void;
}) {
  const marker = useId();
  const svg = useRef<SVGSVGElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const anchors = useRef<Anchors>(new Map());
  const [, refresh] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [preview, setPreview] = useState<BoardConnector>();
  const gesture = useRef<{ id?: string; edge: "from" | "to"; value: BoardConnector } | null>(null);
  useLayoutEffect(() => {
    if (!root.current || !plane.current) return;
    const host = root.current;
    const update = () => {
      if (!plane.current) return;
      const next = boardAnchors(host, plane.current);
      if (JSON.stringify([...next]) !== JSON.stringify([...anchors.current])) {
        anchors.current = next;
        refresh((version) => version + 1);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    const mutations = new MutationObserver(update);
    host.querySelectorAll("[data-block-id]").forEach((element) => observer.observe(element));
    mutations.observe(host, { subtree: true, attributes: true, attributeFilter: ["style"], childList: true });
    host.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); mutations.disconnect(); host.removeEventListener("scroll", update, true); };
  }, [root, plane, blocks, width, height]);
  useLayoutEffect(() => {
    if (!enabled) { gesture.current = null; setPreview(undefined); }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelected(undefined);
      if (!gesture.current && !drawing) return;
      gesture.current = null;
      setPreview(undefined);
      onCancel();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [enabled, drawing, onCancel]);
  useLayoutEffect(() => {
    const board = root.current;
    if (!board || !selected) return;
    const deselect = (event: globalThis.PointerEvent) => {
      const target = event.target as Element | null;
      if (target && !toolbar.current?.contains(target) && !target.closest("[data-connector-control]")) setSelected(undefined);
    };
    board.addEventListener("pointerdown", deselect, true);
    return () => board.removeEventListener("pointerdown", deselect, true);
  }, [root, selected]);

  const point = (event: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { position: [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height] as BoardPoint, r };
  };
  const snap = (event: PointerEvent, exclude?: string): ConnectorEnd => {
    const { position, r } = point(event);
    let best: ConnectorEnd = { point: position };
    let distance = Infinity;
    for (const [objectId, rect] of anchors.current) {
      if (objectId === exclude) continue;
      const inside = position[0] >= rect.left && position[0] <= rect.right && position[1] >= rect.top && position[1] <= rect.bottom;
      for (const side of sides) {
        const end = { point: position, objectId, side };
        const p = resolveEnd(end, anchors.current);
        const pixels = Math.hypot((p[0] - position[0]) * r.width, (p[1] - position[1]) * r.height);
        if ((inside || pixels <= 22) && pixels < distance) { best = { ...end, point: p }; distance = pixels; }
      }
    }
    return best;
  };
  const start = (event: PointerEvent, value?: BoardConnector, edge: "from" | "to" = "to", id?: string, from?: ConnectorEnd) => {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    const end = from ?? snap(event);
    const connector = value ?? { from: end, to: end };
    svg.current?.setPointerCapture(event.pointerId);
    gesture.current = { id, edge, value: connector };
    setPreview(connector);
  };
  const line = (connector: BoardConnector, id?: string) => {
    const editable = id && enabled && !drawing && (canEdit?.(id) ?? true);
    const [x1, y1] = resolveEnd(connector.from, anchors.current);
    const [x2, y2] = resolveEnd(connector.to, anchors.current);
    const coords = { x1: x1 * width, y1: y1 * height, x2: x2 * width, y2: y2 * height };
    const color = connector.color ?? "#2454e8";
    return <g key={id ?? "preview"} color={color}>
      {editable && selected === id && <line {...coords} stroke={color} strokeOpacity={.18} strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="connector-halo" />}
      <line {...coords} stroke={color} strokeWidth={2} strokeDasharray={connector.dashed ? "6 5" : undefined}
        vectorEffect="non-scaling-stroke" markerEnd={connector.head === false ? undefined : `url(#${marker})`} />
      {editable && <line {...coords} data-connector-control className="connector-hit cursor-pointer" stroke="transparent" strokeWidth={18} vectorEffect="non-scaling-stroke"
        pointerEvents="stroke" role="button" tabIndex={0} aria-label="Select connector"
        onClick={(event) => { event.stopPropagation(); setSelected(id); }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(id); } }} />}
      {editable && selected === id && (["from", "to"] as const).map((edge) => <circle key={edge} data-connector-control
        cx={edge === "from" ? coords.x1 : coords.x2} cy={edge === "from" ? coords.y1 : coords.y2} r={6}
        fill="white" stroke={color} strokeWidth={2} pointerEvents="all" className="cursor-grab"
        aria-label={`Drag ${edge === "from" ? "start" : "end"} of connector`}
        onPointerDown={(event) => start(event, connector, edge, id)} />)}
    </g>;
  };
  const chosen = enabled && selected && (canEdit?.(selected) ?? true) && blocks.find((block) => block.id === selected)?.connector;
  const target = gesture.current && preview?.[gesture.current.edge];
  const targetPoint = target?.objectId && resolveEnd(target, anchors.current);
  const targetBounds = target?.objectId ? anchors.current.get(target.objectId) : undefined;
  return <>
    <svg ref={svg} className={`pointer-events-none absolute inset-0 h-full w-full overflow-visible ${drawing ? "z-20" : ""}`} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
      onPointerMove={(event) => {
        const drag = gesture.current;
        if (drag) setPreview({ ...drag.value, [drag.edge]: snap(event, drag.value[drag.edge === "to" ? "from" : "to"].objectId) });
      }}
      onPointerUp={(event) => {
        const drag = gesture.current;
        if (!drag) return;
        const end = snap(event, drag.value[drag.edge === "to" ? "from" : "to"].objectId);
        const value = { ...drag.value, [drag.edge]: end };
        gesture.current = null; setPreview(undefined);
        if (drag.id || Math.hypot(value.from.point[0] - value.to.point[0], value.from.point[1] - value.to.point[1]) > .003) onSave(value, drag.id);
        onCancel();
      }}
      onLostPointerCapture={() => { gesture.current = null; setPreview(undefined); }}>
      <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="context-stroke" /></marker></defs>
      {drawing && enabled && <rect x={-2 * width} y={-2 * height} width={6 * width} height={6 * height}
        fill="transparent" pointerEvents="all" className="cursor-crosshair" onPointerDown={(event) => start(event)} />}
      {blocks.map((block) => block.connector && (preview && gesture.current?.id === block.id ? null : line(block.connector, block.id)))}
      {preview && line(preview)}
      {targetBounds && <rect x={targetBounds.left * width} y={targetBounds.top * height}
        width={(targetBounds.right - targetBounds.left) * width} height={(targetBounds.bottom - targetBounds.top) * height}
        rx={4} fill="none" stroke="#2454e8" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
      {targetPoint && <circle cx={targetPoint[0] * width} cy={targetPoint[1] * height} r={9} fill="#b8e8ff" stroke="#2454e8" strokeWidth="2" />}
      {enabled && selectedObject && anchors.current.has(selectedObject) && sides.map((side) => {
        const end = { point: [0, 0] as BoardPoint, objectId: selectedObject, side };
        end.point = resolveEnd(end, anchors.current);
        return <circle key={side} cx={end.point[0] * width} cy={end.point[1] * height} r={5} fill="#2454e8" stroke="white"
          pointerEvents="all" className="cursor-crosshair" aria-label={`Connect from ${side}`}
          onPointerDown={(event) => start(event, undefined, "to", undefined, end)} />;
      })}
    </svg>
    {chosen && selected && !drawing && (() => {
      // A small floating toolbar just above the middle of the arrow, in the same style as the rest of the board.
      const [x1, y1] = resolveEnd(chosen.from, anchors.current);
      const [x2, y2] = resolveEnd(chosen.to, anchors.current);
      const left = Math.max(viewOrigin[0] + 8, ((x1 + x2) / 2) * width - 130);
      const top = Math.max(viewOrigin[1] + 8, Math.min(y1, y2) * height - 56);
      const color = chosen.color ?? "#2454e8";
      return <div ref={toolbar} role="toolbar" aria-label="Arrow style" style={{ left, top }} className="connector-toolbar board-pop absolute z-20">
        <LiquidSwatches label="Arrow color" colors={CONNECTOR_COLORS} value={color.toLowerCase()} dot={16}
          onChange={(value) => onSave({ ...chosen, color: value }, selected)} />
        <span className="connector-toolbar-sep" aria-hidden="true" />
        <button type="button" className="connector-tool" aria-pressed={!!chosen.dashed} title="Dashed line" aria-label="Dashed line"
          onClick={() => onSave({ ...chosen, dashed: !chosen.dashed }, selected)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h3M9 10h3M15 10h2" /></svg>
        </button>
        <button type="button" className="connector-tool" aria-pressed={chosen.head !== false} title="Arrowhead" aria-label="Arrowhead"
          onClick={() => onSave({ ...chosen, head: chosen.head === false }, selected)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M12 6l4 4-4 4" /></svg>
        </button>
        <span className="connector-toolbar-sep" aria-hidden="true" />
        <button type="button" className="connector-tool connector-delete" title="Delete arrow" aria-label="Delete arrow"
          onClick={() => { onDelete(selected); setSelected(undefined); }}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10M8 6V4.5h4V6M6.5 6l.6 9.5h5.8l.6-9.5" /></svg>
        </button>
      </div>;
    })()}
  </>;
}
