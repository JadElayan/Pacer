"use client";

import { useId, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
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

export function BoardConnectors({ root, plane, blocks, selectedObject, width, height, viewOrigin, enabled, drawing, onCancel, onSave, onDelete }: {
  root: RefObject<HTMLDivElement | null>; plane: RefObject<SVGSVGElement | null>;
  blocks: Block[]; selectedObject?: string; width: number; height: number;
  viewOrigin: BoardPoint;
  enabled: boolean; drawing: boolean; onCancel: () => void;
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
    const [x1, y1] = resolveEnd(connector.from, anchors.current);
    const [x2, y2] = resolveEnd(connector.to, anchors.current);
    const coords = { x1: x1 * width, y1: y1 * height, x2: x2 * width, y2: y2 * height };
    const color = connector.color ?? "#2454e8";
    return <g key={id ?? "preview"} color={color}>
      <line {...coords} stroke={color} strokeWidth={2} strokeDasharray={connector.dashed ? "6 5" : undefined}
        vectorEffect="non-scaling-stroke" markerEnd={connector.head === false ? undefined : `url(#${marker})`} />
      {id && enabled && !drawing && <line {...coords} data-connector-control stroke="transparent" strokeWidth={18} vectorEffect="non-scaling-stroke"
        className="cursor-pointer" pointerEvents="stroke" role="button" tabIndex={0} aria-label="Select connector"
        onClick={(event) => { event.stopPropagation(); setSelected(id); }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(id); } }} />}
      {id && enabled && !drawing && selected === id && (["from", "to"] as const).map((edge) => <circle key={edge} data-connector-control
        cx={edge === "from" ? coords.x1 : coords.x2} cy={edge === "from" ? coords.y1 : coords.y2} r={6}
        fill="white" stroke={color} strokeWidth={2} pointerEvents="all" className="cursor-grab"
        aria-label={`Drag ${edge === "from" ? "start" : "end"} of connector`}
        onPointerDown={(event) => start(event, connector, edge, id)} />)}
    </g>;
  };
  const chosen = enabled && blocks.find((block) => block.id === selected)?.connector;
  const target = gesture.current && preview?.[gesture.current.edge];
  const targetPoint = target?.objectId && resolveEnd(target, anchors.current);
  const targetBounds = target?.objectId ? anchors.current.get(target.objectId) : undefined;
  return <>
    <svg ref={svg} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
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
    {chosen && selected && !drawing && <div ref={toolbar} role="toolbar" aria-label="Connector formatting"
      style={{ left: viewOrigin[0] + 12, top: viewOrigin[1] + 12 }}
      className="absolute z-20 flex flex-wrap items-center gap-2 rounded-xl border border-stone bg-white p-2 text-sm shadow">
      <label>Color <input type="color" value={chosen.color ?? "#2454e8"} onChange={(event) => onSave({ ...chosen, color: event.target.value }, selected)} /></label>
      <button type="button" className="btn btn-outline btn-sm" aria-pressed={!!chosen.dashed} onClick={() => onSave({ ...chosen, dashed: !chosen.dashed }, selected)}>Dashed</button>
      <button type="button" className="btn btn-outline btn-sm" aria-pressed={chosen.head !== false} onClick={() => onSave({ ...chosen, head: chosen.head === false }, selected)}>Arrowhead</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => { onDelete(selected); setSelected(undefined); }}>Delete</button>
    </div>}
  </>;
}
