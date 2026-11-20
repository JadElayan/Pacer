"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { Block, BlockKind, BoardConnector, BoardShapeSize, BoardTextRun, Stroke } from "@/lib/types";
import { BoardConnectors, boardAnchors, resolveEnd } from "./BoardConnectors";
import { BoardText, BoardTextEditor } from "./BoardTextEditor";
import { MathView, mathVisibleText } from "./MathView";
import { mathInputToTex, texToSpeech } from "@/lib/mathInput";
import { InkPath } from "./InkPath";
import { BoardObject, ShapeTools, StickyEditor, StickyTools } from "./BoardObjects";
import { BoardToolIcon, boardToolCursor } from "./BoardToolIcon";
import type { ComponentProps } from "react";

/** "Equation: <what is shown>", plus a spoken version when the two differ (fractions, powers). */
const equationName = (tex: string) => {
  const shown = mathVisibleText(tex), spoken = texToSpeech(tex);
  return shown.replace(/\s/g, "") === spoken.replace(/\s/g, "") ? `Equation: ${spoken}` : `Equation: ${shown}, read as ${spoken}`;
};

export type BoardTool = "select" | "pen" | "highlight" | "erase";
type Point = [number, number];
type ShapeTool = "rectangle" | "circle" | "diamond";
type ShapePreview = { kind: ShapeTool; position: Point; size: BoardShapeSize };
const resizeCorners = [
  ["Top left", -1, -1, "-left-1.5 -top-1.5 cursor-nwse-resize"],
  ["Top right", 1, -1, "-right-1.5 -top-1.5 cursor-nesw-resize"],
  ["Bottom left", -1, 1, "-left-1.5 -bottom-1.5 cursor-nesw-resize"],
  ["Bottom right", 1, 1, "-right-1.5 -bottom-1.5 cursor-nwse-resize"],
] as const;
/** Shapes and sticky notes: corners resize width and height freely (Shift keeps the proportions); edges change one. */
const boxHandles = [
  ["Top left", -1, -1, "-left-1.5 -top-1.5 size-3 rounded-full cursor-nwse-resize"],
  ["Top right", 1, -1, "-right-1.5 -top-1.5 size-3 rounded-full cursor-nesw-resize"],
  ["Bottom left", -1, 1, "-left-1.5 -bottom-1.5 size-3 rounded-full cursor-nesw-resize"],
  ["Bottom right", 1, 1, "-right-1.5 -bottom-1.5 size-3 rounded-full cursor-nwse-resize"],
  ["Top edge", 0, -1, "left-1/2 -top-1 h-2 w-5 -translate-x-1/2 rounded-full cursor-ns-resize"],
  ["Bottom edge", 0, 1, "left-1/2 -bottom-1 h-2 w-5 -translate-x-1/2 rounded-full cursor-ns-resize"],
  ["Left edge", -1, 0, "top-1/2 -left-1 h-5 w-2 -translate-y-1/2 rounded-full cursor-ew-resize"],
  ["Right edge", 1, 0, "top-1/2 -right-1 h-5 w-2 -translate-y-1/2 rounded-full cursor-ew-resize"],
] as const;
const isBoxed = (kind: BlockKind) => kind === "rectangle" || kind === "circle" || kind === "diamond" || kind === "sticky";

function hitsStroke(stroke: Stroke, [x, y]: Point, w: number, h: number) {
  return stroke.pts.some(([ax, ay], i) => {
    const [bx, by] = stroke.pts[i + 1] ?? [ax, ay];
    const dx = (bx - ax) * w, dy = (by - ay) * h;
    const px = (x - ax) * w, py = (y - ay) * h;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - t * dx, py - t * dy) <= 12 + (stroke.width ?? 3) / 2;
  });
}

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Anchor { ids: string[]; rect: Rect; source: "block" | "snip"; image?: string; slideText?: string; slideTitle?: string; boardPosition?: Point; topicTitle?: string }

/** Renders ink within the selected area as a white-background PNG for the AI. */
function strokesImage(strokes: Stroke[], box: Rect, w: number, h: number): string | undefined {
  const hit = strokes.filter((s) => s.pts.some(([x, y]) => x * w >= box.left && x * w <= box.right && y * h >= box.top && y * h <= box.bottom));
  if (!hit.length) return undefined;
  const bw = box.right - box.left, bh = box.bottom - box.top;
  const k = Math.min(1, 960 / Math.max(bw, bh));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bw * k)); c.height = Math.max(1, Math.round(bh * k));
  const g = c.getContext("2d"); if (!g) return undefined;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.lineCap = "round"; g.lineJoin = "round";
  hit.forEach((s) => {
    g.strokeStyle = s.color ?? "#000"; g.globalAlpha = s.opacity ?? 1; g.lineWidth = (s.width ?? 3) * k;
    g.beginPath();
    s.pts.forEach(([x, y], i) => {
      const px = (x * w - box.left) * k, py = (y * h - box.top) * k;
      if (i) g.lineTo(px, py);
      else { g.moveTo(px, py); if (s.pts.length === 1) g.lineTo(px + 0.01, py); }
    });
    g.stroke();
  });
  return c.toDataURL("image/png");
}

export function handwritingImage(strokes: Stroke[], w: number, h: number) {
  if (!w || !h || !strokes.length) return;
  let left = w, right = 0, top = h, bottom = 0;
  for (const stroke of strokes) {
    for (const [x, y] of stroke.pts) {
      left = Math.min(left, x * w);
      right = Math.max(right, x * w);
      top = Math.min(top, y * h);
      bottom = Math.max(bottom, y * h);
    }
  }
  return strokesImage(strokes, { left: left - 12, right: right + 12, top: top - 12, bottom: bottom + 12 }, w, h);
}

export function Whiteboard({ boardRef, blocks, strokes, isTeacher, privateInk, canEraseStroke, connectorMode, onConnector, canEditBlock, selectedIds, spotlightId, onSelect, snipActive, onSnip, tool, ink, zoom = 1, position, onZoom, onStroke, onErase, onDelete, onEditSticky, onDuplicateSticky, onResizeBlock, onEditText, placement, modeIcon, onPlace, onCancelPlacement, onMoveBlock, children, slide, empty }: {
  boardRef: React.RefObject<HTMLDivElement | null>; blocks: Block[]; strokes: Stroke[]; isTeacher: boolean; selectedIds: string[]; spotlightId?: string;
  /** Whether the teacher has put nothing here yet. A student's own annotations don't count, so the waiting hint stays. */ empty?: boolean;
  onSelect: (a: Anchor) => void; snipActive: boolean; onSnip: (a: Anchor | null) => void; tool: BoardTool;
  ink: Pick<Stroke, "color" | "width" | "opacity">;
  zoom?: number;
  position?: Point;
  onZoom?: (zoom: number, position: Point) => void;
  onStroke: (stroke: Omit<Stroke, "id">) => void; onErase: (ids: Set<string>) => void;
  onDelete: (id: string, detached?: Record<string, BoardConnector>, origin?: Point) => void; children?: React.ReactNode;
  privateInk?: boolean;
  canEraseStroke?: (id: string) => boolean;
  connectorMode?: boolean;
  onConnector?: (connector: BoardConnector, id?: string) => void;
  canEditBlock?: (id: string) => boolean;
  onEditSticky?: (id: string, changes: Partial<Pick<Block, "content" | "stickyStyle" | "shapeColor">>) => void;
  onDuplicateSticky?: (block: Block) => void;
  onResizeBlock?: (id: string, changes: Partial<Pick<Block, "fontSize" | "scale" | "position" | "textWidth" | "shapeSize">>) => void;
  onEditText?: (id: string, content: string, runs?: BoardTextRun[]) => void;
  placement?: Exclude<BlockKind, "connector">;
  modeIcon?: ComponentProps<typeof BoardToolIcon>["tool"];
  onPlace?: (kind: BlockKind, content: string, position: Point, runs?: BoardTextRun[], shapeSize?: BoardShapeSize) => string | void;
  onCancelPlacement?: () => void;
  onMoveBlock?: (id: string, position: Point) => void;
  slide?: { url: string; aspect: number; maxHeight?: string };
}) {
  const [drag, setDrag] = useState<{ pointer: number; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const snipLayer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (snipActive) snipLayer.current?.focus({ preventScroll: true });
    else setDrag(null);
  }, [snipActive]);
  const [live, setLive] = useState<[number, number][] | null>(null);
  const [erased, setErased] = useState<Set<string>>(new Set());
  const gesture = useRef<{ id: number; tool: BoardTool; ink: typeof ink; points: Point[]; erased: Set<string>; pressures: number[] } | null>(null);
  // Palm rejection: once a stylus (Apple Pencil) has touched the board, fingers stop drawing and only pan or zoom.
  const penSeen = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const appliedScroll = useRef<Point>([0, 0]);
  const inkLayer = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<{ position: Point; content: string }>();
  const shapeTool = placement === "rectangle" || placement === "circle" || placement === "diamond" ? placement : undefined;
  const shapeDrag = useRef<{ pointer: number; start: Point } | null>(null);
  const [shapePreview, setShapePreview] = useState<ShapePreview>();
  const [selectedSticky, setSelectedSticky] = useState<string>();
  const [editingText, setEditingText] = useState<string>();
  const [editingSticky, setEditingSticky] = useState<string>();
  const [moving, setMoving] = useState<{ id: string; position: Point }>();
  const [resizing, setResizing] = useState<{ id: string; size: number; position: Point; box?: BoardShapeSize }>();
  const boxDrag = useRef<{ pointer: number; sx: number; sy: number; start: Point; origin: Point; w0: number; h0: number; next?: { box: BoardShapeSize; position: Point } } | undefined>(undefined);
  const resizeDrag = useRef<{ pointer: number; origin: Point; start: Point; span: Point; pixels: Point; size: number; next?: { size: number; position: Point } } | undefined>(undefined);
  const blockDrag = useRef<{ id: string; pointer: number; start: Point; origin: Point; position?: Point } | null>(null);
  const ignoreBlockClick = useRef(false);
  // Motion: items added after the board opened animate in by kind, edited items settle, removed ones fade out.
  const previousBlocks = useRef(blocks);
  const [motion, setMotion] = useState<Record<string, "enter" | "edit">>({});
  const [leaving, setLeaving] = useState<Block[]>([]);
  useLayoutEffect(() => {
    const before = new Map(previousBlocks.current.map((block) => [block.id, block]));
    const now = new Set(blocks.map((block) => block.id));
    previousBlocks.current = blocks;
    const changes: Record<string, "enter" | "edit"> = {};
    for (const block of blocks) {
      const old = before.get(block.id);
      if (!old) changes[block.id] = "enter";
      else if (old.content !== block.content || JSON.stringify(old.textRuns) !== JSON.stringify(block.textRuns)) changes[block.id] = "edit";
    }
    const gone = [...before.values()].filter((block) => !now.has(block.id) && block.position && !block.connector);
    if (Object.keys(changes).length) {
      setMotion((current) => ({ ...current, ...changes }));
      window.setTimeout(() => setMotion((current) => {
        const next = { ...current };
        for (const id of Object.keys(changes)) if (next[id] === changes[id]) delete next[id];
        return next;
      }), 900);
    }
    if (gone.length) {
      setLeaving((current) => [...current.filter((block) => !now.has(block.id)), ...gone]);
      window.setTimeout(() => setLeaving((current) => current.filter((block) => !gone.some((item) => item.id === block.id))), 320);
    }
  }, [blocks]);
  useLayoutEffect(() => {
    setDraft(undefined);
    shapeDrag.current = null;
    setShapePreview(undefined);
  }, [placement]);
  const [previewZoom, setPreviewZoom] = useState<number>();
  const [previewPosition, setPreviewPosition] = useState<Point>();
  const [viewportSize, setViewportSize] = useState<Point>([0, 0]);
  const displayZoom = previewZoom ?? zoom;
  const [viewX, viewY] = previewPosition ?? position ?? [0, 0];
  const [width, height] = viewportSize;
  const targetX = viewX * width;
  const targetY = viewY * height;
  const left = Math.max(0, -targetX);
  const top = Math.max(0, -targetY);
  const fingers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number; next: number; anchor: Point; position: Point } | null>(null);
  const trackpadScale = useRef(1);
  const pan = useRef<{ id: number; start: Point; origin: Point; position: Point } | null>(null);
  const [panning, setPanning] = useState(false);
  const lastShare = useRef(0);
  const shareView = (scale: number, offset: Point, final = false) => {
    const now = performance.now();
    if (final || now - lastShare.current >= 80) {
      lastShare.current = now;
      onZoom?.(scale, offset);
    }
  };
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setViewportSize([element.clientWidth, element.clientHeight]);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.scrollTo(Math.max(0, targetX), Math.max(0, targetY));
    appliedScroll.current = [element.scrollLeft, element.scrollTop];
  }, [targetX, targetY, displayZoom, width, height]);
  const positionFromPixels = (x: number, y: number, scale: number): Point => {
    // Keep part of the board within reach even when panning past an edge.
    const limit = (value: number, size: number) => Math.max(-size * 0.8, Math.min(size * scale - size * 0.2, value));
    return [limit(x, width) / Math.max(1, width), limit(y, height) / Math.max(1, height)];
  };
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !onZoom || !width || !height) return;

    let frame = 0;
    let scale = displayZoom;
    let offset: Point = [targetX, targetY];
    const moveTo = (x: number, y: number, next: number) => {
      const position = positionFromPixels(x, y, next);
      offset = [position[0] * width, position[1] * height];
      scale = next;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          onZoom(Math.round(scale * 100) / 100, [offset[0] / width, offset[1] / height]);
        });
      }
    };
    const zoomAt = (factor: number, clientX: number, clientY: number) => {
      const next = Math.max(0.5, Math.min(2.5, scale * factor));
      if (next === scale) return;
      const rect = element.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      moveTo((offset[0] + x) * next / scale - x, (offset[1] + y) * next / scale - y, next);
    };
    const wheel = (event: WheelEvent) => {
      // Chromium and Firefox also report trackpad pinch as Ctrl + wheel.
      event.preventDefault();
      if (gesture.current || pan.current || pinch.current) return;
      const dx = event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1);
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      if (event.ctrlKey) zoomAt(Math.exp(-dy * 0.002), event.clientX, event.clientY);
      else moveTo(offset[0] + dx, offset[1] + dy, scale);
    };
    const gestureStart = (event: Event) => {
      event.preventDefault();
      trackpadScale.current = 1;
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      if (gesture.current || pan.current || pinch.current) return;
      const { scale, clientX, clientY } = event as MouseEvent & { scale: number };
      if (!Number.isFinite(scale) || scale <= 0) return;
      zoomAt(scale / trackpadScale.current, clientX, clientY);
      trackpadScale.current = scale;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("gesturestart", gestureStart, { passive: false });
    element.addEventListener("gesturechange", gestureChange, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("gesturestart", gestureStart);
      element.removeEventListener("gesturechange", gestureChange);
      cancelAnimationFrame(frame);
    };
  });
  const measureTouch = (element: HTMLDivElement) => {
    const [a, b] = fingers.current.values();
    if (!a || !b) return;
    const rect = element.getBoundingClientRect();
    return { distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
      x: (a[0] + b[0]) / 2 - rect.left, y: (a[1] + b[1]) / 2 - rect.top };
  };
  const touchDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onZoom) return;
    if (e.pointerType === "mouse" && e.button === 2) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const origin: Point = [e.currentTarget.scrollLeft - left, e.currentTarget.scrollTop - top];
      pan.current = { id: e.pointerId, start: [e.clientX, e.clientY], origin, position: [viewX, viewY] };
      setPanning(true);
      return;
    }
    if (e.pointerType !== "touch") return;
    fingers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const touch = measureTouch(e.currentTarget);
    if (!touch || pinch.current) return;
    blockDrag.current = null;
    setMoving(undefined);
    resizeDrag.current = undefined;
    setResizing(undefined);
    shapeDrag.current = null;
    setShapePreview(undefined);
    gesture.current = null;
    setLive(null);
    setErased(new Set());
    const { scrollLeft, scrollTop } = e.currentTarget;
    pinch.current = { distance: touch.distance, zoom, next: zoom,
      anchor: [(scrollLeft + touch.x - left) / zoom, (scrollTop + touch.y - top) / zoom], position: [viewX, viewY] };
  };
  const touchMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = pan.current;
    if (drag?.id === e.pointerId) {
      drag.position = positionFromPixels(drag.origin[0] + drag.start[0] - e.clientX, drag.origin[1] + drag.start[1] - e.clientY, zoom);
      setPreviewPosition(drag.position);
      shareView(zoom, drag.position);
      return;
    }
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const start = pinch.current;
    const touch = measureTouch(e.currentTarget);
    if (!start || !touch) return;
    start.next = Math.round(Math.max(0.5, Math.min(2.5, start.zoom * touch.distance / start.distance)) * 100) / 100;
    start.position = positionFromPixels(start.anchor[0] * start.next - touch.x, start.anchor[1] * start.next - touch.y, start.next);
    setPreviewPosition(start.position);
    setPreviewZoom(start.next);
    shareView(start.next, start.position);
  };
  const touchEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pan.current?.id === e.pointerId) {
      shareView(zoom, pan.current.position, true);
      pan.current = null;
      setPanning(false);
      setPreviewPosition(undefined);
      return;
    }
    if (!fingers.current.delete(e.pointerId) || !pinch.current || fingers.current.size >= 2) return;
    const { next, position } = pinch.current;
    pinch.current = null;
    shareView(next, position, true);
    setPreviewZoom(undefined);
    setPreviewPosition(undefined);
  };
  const active = !snipActive && (isTeacher || privateInk) && tool !== "select";
  const deleteObject = (id: string) => {
    const detached: Record<string, BoardConnector> = {};
    let origin: Point | undefined;
    if (boardRef.current && inkLayer.current) {
      const anchors = boardAnchors(boardRef.current, inkLayer.current);
      const rect = anchors.get(id);
      if (rect) origin = [rect.left, rect.top];
      for (const block of blocks) {
        const connector = block.connector;
        if (!connector || (connector.from.objectId !== id && connector.to.objectId !== id)) continue;
        detached[block.id] = { ...connector,
          from: connector.from.objectId === id ? { point: resolveEnd(connector.from, anchors) } : connector.from,
          to: connector.to.objectId === id ? { point: resolveEnd(connector.to, anchors) } : connector.to,
        };
      }
    }
    onDelete(id, detached, origin);
  };
  const rel = (r: DOMRect | Rect): Rect => {
    const b = boardRef.current!.getBoundingClientRect();
    return { left: r.left - b.left, top: r.top - b.top, right: r.right - b.left, bottom: r.bottom - b.top };
  };

  const clampTo = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const finishSnip = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== event.pointerId || !boardRef.current) return;
    const b = boardRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(b.width, event.clientX - b.left));
    const y = Math.max(0, Math.min(b.height, event.clientY - b.top));
    const box = { left: Math.min(drag.x0, x), right: Math.max(drag.x0, x), top: Math.min(drag.y0, y), bottom: Math.max(drag.y0, y) };
    setDrag(null);
    if (box.right - box.left < 10 || box.bottom - box.top < 10) { onSnip(null); return; }
    const ids: string[] = [];
    boardRef.current.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < box.right + b.left && r.right > box.left + b.left && r.top < box.bottom + b.top && r.bottom > box.top + b.top) ids.push(el.dataset.blockId!);
    });
    const inkBounds = inkLayer.current?.getBoundingClientRect();
    const image = inkBounds && strokesImage(strokes, {
      left: box.left + b.left - inkBounds.left, right: box.right + b.left - inkBounds.left,
      top: box.top + b.top - inkBounds.top, bottom: box.bottom + b.top - inkBounds.top,
    }, inkBounds.width, inkBounds.height);
    onSnip({ ids, rect: box, source: "snip", image });
  };
  const moveInk = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const bounds = inkLayer.current?.getBoundingClientRect();
    if (!g || g.id !== e.pointerId || !bounds?.width || !bounds.height) return;
    const { width, height } = bounds;
    const visible = e.currentTarget.getBoundingClientRect();
    const x = (Math.max(visible.left, Math.min(visible.right, e.clientX)) - bounds.left) / width;
    const y = (Math.max(visible.top, Math.min(visible.bottom, e.clientY)) - bounds.top) / height;
    const point: Point = slide ? [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))] : [x, y];
    const last = g.points.at(-1);
    if (g.tool !== "erase" && last && Math.hypot((point[0] - last[0]) * width, (point[1] - last[1]) * height) < 1) return;
    g.points.push(point);
    if (e.pointerType === "pen" && e.pressure > 0) g.pressures.push(e.pressure);
    if (g.tool !== "erase") { setLive([...g.points]); return; }
    const [lastX, lastY] = last ?? point;
    const steps = Math.max(1, Math.ceil(Math.hypot((point[0] - lastX) * width, (point[1] - lastY) * height) / 8));
    for (let i = 1; i <= steps; i++) {
      const sample: Point = [lastX + (point[0] - lastX) * i / steps, lastY + (point[1] - lastY) * i / steps];
      for (const stroke of strokes) {
        if ((!canEraseStroke || canEraseStroke(stroke.id)) && !g.erased.has(stroke.id) && hitsStroke(stroke, sample, width, height)) g.erased.add(stroke.id);
      }
    }
    setErased(new Set(g.erased));
  };
  const finishInk = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (commit) moveInk(e);
    gesture.current = null;
    setLive(null);
    setErased(new Set());
    if (!commit) return;
    if (g.tool === "erase") onErase(g.erased);
    else if (g.points.length) {
      // A pen's average pressure sets the stroke weight (light touch thinner, pressing harder thicker).
      const pressure = g.pressures.length ? g.pressures.reduce((a, b) => a + b, 0) / g.pressures.length : undefined;
      const width = pressure && g.ink.width ? Math.round(g.ink.width * (0.55 + pressure * 0.9) * 10) / 10 : g.ink.width;
      onStroke({ ...g.ink, width, pts: g.points });
    }
  };

  const canvasPoint = (x: number, y: number): Point | undefined => {
    const bounds = inkLayer.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    return [(x - bounds.left) / bounds.width, (y - bounds.top) / bounds.height];
  };
  const saveDraft = () => {
    // Equations are saved as TeX, converted from what was typed (x^2, a/b) so they look as they did in the preview.
    const content = placement === "equation" ? mathInputToTex(draft?.content ?? "") : draft?.content.trim();
    if (placement && draft && content) onPlace?.(placement, content, draft.position);
    else onCancelPlacement?.();
  };
  const currentShape = (event: React.PointerEvent<HTMLDivElement>): ShapePreview | undefined => {
    const drag = shapeDrag.current;
    if (!shapeTool || !drag || drag.pointer !== event.pointerId || !width || !height) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const end = canvasPoint(
      Math.max(bounds.left, Math.min(bounds.right, event.clientX)),
      Math.max(bounds.top, Math.min(bounds.bottom, event.clientY)),
    );
    if (!end) return;
    const dx = (end[0] - drag.start[0]) * width;
    const dy = (end[1] - drag.start[1]) * height;
    if (Math.hypot(dx, dy) * displayZoom < 5) return;
    const w = Math.max(12, Math.abs(dx));
    const h = Math.max(12, Math.abs(dy));
    const diameter = Math.min(w, h);
    const size = shapeTool === "circle" ? { width: diameter, height: diameter } : { width: w, height: h };
    return {
      kind: shapeTool,
      position: [drag.start[0] - (dx < 0 ? size.width / width : 0), drag.start[1] - (dy < 0 ? size.height / height : 0)],
      size,
    };
  };
  const finishShape = (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = shapeDrag.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const shape = commit ? currentShape(event) : undefined;
    shapeDrag.current = null;
    setShapePreview(undefined);
    if (!commit || !shapeTool) return;
    const id = onPlace?.(shapeTool, shapeTool, shape?.position ?? drag.start, undefined, shape?.size);
    if (id) setSelectedSticky(id);
  };
  const place = (x: number, y: number) => {
    const position = canvasPoint(x, y);
    if (!position || !placement) return;
    if (placement === "text" || placement === "equation" || placement === "sticky") {
      setDraft({ position, content: "" });
    } else {
      onPlace?.(placement, placement, position);
    }
  };
  const finishBlockDrag = (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = blockDrag.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    blockDrag.current = null;
    setMoving(undefined);
    if (commit && drag.position) onMoveBlock?.(drag.id, drag.position);
  };

  const isShape = (kind: BlockKind) => kind === "rectangle" || kind === "circle" || kind === "diamond" || kind === "arrow";
  const renderBlock = (b: Block) => {
    const resize = resizing?.id === b.id ? resizing : undefined;
    const location = resize?.position ?? (moving?.id === b.id ? moving.position : b.position);
    const origin = resize ? resizeDrag.current?.origin : blockDrag.current?.origin;
    const editable = canEditBlock?.(b.id) ?? true;
    const stickyEditing = editable && b.kind === "sticky" && editingSticky === b.id && !!onEditSticky && !active && !placement;
    const editing = stickyEditing || (editable && editingText === b.id && !!onEditText && !active && !placement);
    const movable = editable && !!onMoveBlock && !placement && !active && !editing && !connectorMode;
    const type = b.kind === "text" || b.kind === "equation";
    const fontSize = b.fontSize ?? (b.kind === "equation" ? 26 : 20);
    const reflow = b.kind === "text";
    const size = reflow ? b.textWidth ?? 0 : type ? fontSize : (b.scale ?? 1) * 100;
    const minSize = reflow ? 48 : type ? 12 : 50;
    const maxSize = reflow ? Math.max(48, width * .85) : type ? 80 : 300;
    const clampSize = (next: number) => Math.round(Math.max(minSize, Math.min(maxSize, next)));
    const commitSize = (next: number, position?: Point) => onResizeBlock?.(b.id, {
      ...(reflow ? { textWidth: next } : type ? { fontSize: next } : { scale: next / 100 }), ...(position ? { position } : {}),
    });
    const selected = selectedIds.includes(b.id) || (!placement && !active && selectedSticky === b.id);
    return <div key={b.id} data-block-id={b.id} role="button" tabIndex={0} aria-pressed={selected}
      data-kind={b.kind} data-motion={motion[b.id]} data-moving={moving?.id === b.id ? "" : undefined}
      aria-label={b.kind === "equation" ? equationName(b.content) : `Note: ${b.content}`}
      style={{ width: reflow ? resize?.size ?? b.textWidth : undefined, ...(location && (b.position ? { left: `${location[0] * 100}%`, top: `${location[1] * 100}%` } : {
        transform: `translate(${(location[0] - (origin?.[0] ?? location[0])) * width}px, ${(location[1] - (origin?.[1] ?? location[1])) * height}px)`,
      })) }}
      onPointerDown={(event) => {
        ignoreBlockClick.current = false;
        if (!movable || !event.isPrimary || event.button !== 0 || (event.target as Element).closest("button")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const origin = b.position ?? canvasPoint(rect.left, rect.top);
        if (!origin) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        blockDrag.current = { id: b.id, pointer: event.pointerId, start: [event.clientX, event.clientY], origin };
      }}
      onPointerMove={(event) => {
        const drag = blockDrag.current;
        if (!drag || drag.id !== b.id || drag.pointer !== event.pointerId || !event.buttons || !width || !height) return;
        const dx = event.clientX - drag.start[0], dy = event.clientY - drag.start[1];
        if (!drag.position && Math.hypot(dx, dy) < 4) return;
        const bounds = viewport.current?.getBoundingClientRect();
        if (!bounds) return;
        const start = canvasPoint(bounds.left, bounds.top);
        const end = canvasPoint(bounds.right - 24, bounds.bottom - 24);
        if (!start || !end) return;
        drag.position = [
          Math.max(start[0], Math.min(end[0], drag.origin[0] + dx / (width * displayZoom))),
          Math.max(start[1], Math.min(end[1], drag.origin[1] + dy / (height * displayZoom))),
        ];
        ignoreBlockClick.current = true;
        setMoving({ id: b.id, position: drag.position });
      }}
      onPointerUp={(event) => finishBlockDrag(event, true)}
      onPointerCancel={(event) => finishBlockDrag(event, false)}
      onLostPointerCapture={(event) => finishBlockDrag(event, false)}
      onClick={(event) => {
        if (placement || ignoreBlockClick.current || editing) return;
        if (onMoveBlock && editable) setSelectedSticky(b.id);
        const rect = event.currentTarget.getBoundingClientRect();
        onSelect({ ids: [b.id], rect: rel(rect), source: "block", boardPosition: canvasPoint(rect.left, rect.top) });
      }}
      onDoubleClick={() => {
        if (movable && reflow && onEditText) { setSelectedSticky(b.id); setEditingText(b.id); }
        if (movable && b.kind === "sticky" && onEditSticky) { setSelectedSticky(b.id); setEditingSticky(b.id); }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || placement || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        if (onMoveBlock && editable) {
          if (event.key === "Enter" && reflow && selected && onEditText) setEditingText(b.id);
          if (event.key === "Enter" && b.kind === "sticky" && selected && onEditSticky) setEditingSticky(b.id);
          setSelectedSticky(b.id);
        }
        const rect = event.currentTarget.getBoundingClientRect();
        onSelect({ ids: [b.id], rect: rel(rect), source: "block", boardPosition: canvasPoint(rect.left, rect.top) });
      }}
      className={`block-card group w-fit max-w-full break-words rounded-sm ${b.position ? "absolute max-w-[85%]" : "relative"} ${movable ? "cursor-grab select-none active:cursor-grabbing" : "cursor-pointer"} ${selected ? "z-10 outline-2 outline-sky outline-offset-2" : ""} ${b.id === spotlightId ? "ring-4 ring-sky" : ""}`}>
      {type ? <div className={editing ? "" : "overflow-x-auto"} style={{ fontSize: reflow ? fontSize : resize?.size ?? fontSize }}>
        {b.kind === "equation" ? <MathView tex={b.content} display={false} /> : editing ?
          <BoardTextEditor content={b.content} runs={b.textRuns} baseSize={fontSize}
            toolbarAbove={((location?.[1] ?? 0) * displayZoom - viewY) * height > 60}
            onCommit={(content, runs) => { onEditText?.(b.id, content, runs); setEditingText(undefined); }} /> :
          <div className="whitespace-pre-wrap break-words leading-snug"><BoardText content={b.content} runs={b.textRuns} /></div>}
      </div> : <div style={{ zoom: resize?.box ? 1 : (resize?.size ?? size) / 100 }}>{stickyEditing ?
        <StickyEditor content={b.content} style={b.stickyStyle} size={b.shapeSize} onCancel={() => setEditingSticky(undefined)}
          onCommit={(content) => { onEditSticky?.(b.id, { content }); setEditingSticky(undefined); }} /> :
        <BoardObject kind={b.kind} content={b.content} stickyStyle={b.stickyStyle} shapeSize={resize?.box ?? b.shapeSize} color={b.shapeColor} />}</div>}
      {editable && selected && !editing && !connectorMode && onResizeBlock && isBoxed(b.kind) && boxHandles.map(([label, sx, sy, classes]) => <button key={label} type="button"
        aria-label={`${label} resize handle`} className={`absolute z-20 touch-none border-2 border-sky bg-white after:absolute after:-inset-2 after:content-[''] ${classes}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!event.isPrimary || event.button !== 0 || !width || !height) return;
          const rect = event.currentTarget.parentElement!.getBoundingClientRect();
          const origin = b.position ?? canvasPoint(rect.left, rect.top);
          if (!origin) return;
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
          boxDrag.current = { pointer: event.pointerId, sx, sy, start: [event.clientX, event.clientY], origin, w0: rect.width / displayZoom, h0: rect.height / displayZoom };
        }}
        onPointerMove={(event) => {
          const drag = boxDrag.current;
          if (!drag || drag.pointer !== event.pointerId) return;
          const minW = b.kind === "sticky" ? 72 : 24, minH = b.kind === "sticky" ? 48 : 24;
          let w = drag.w0 + drag.sx * (event.clientX - drag.start[0]) / displayZoom;
          let h = drag.h0 + drag.sy * (event.clientY - drag.start[1]) / displayZoom;
          if (event.shiftKey && drag.sx && drag.sy) { const k = Math.max(w / drag.w0, h / drag.h0); w = drag.w0 * k; h = drag.h0 * k; }
          w = Math.round(Math.max(minW, Math.min(width * .95, w)));
          h = Math.round(Math.max(minH, Math.min(height * .95, h)));
          const position: Point = [drag.origin[0] + (drag.sx < 0 ? (drag.w0 - w) / width : 0), drag.origin[1] + (drag.sy < 0 ? (drag.h0 - h) / height : 0)];
          drag.next = { box: { width: w, height: h }, position };
          setResizing({ id: b.id, size: 100, position, box: drag.next.box });
        }}
        onPointerUp={(event) => {
          const drag = boxDrag.current;
          if (drag?.pointer !== event.pointerId) return;
          boxDrag.current = undefined;
          setResizing(undefined);
          if (drag.next) onResizeBlock(b.id, { shapeSize: drag.next.box, scale: 1, position: drag.next.position });
        }}
        onLostPointerCapture={() => { boxDrag.current = undefined; setResizing(undefined); }}
        onKeyDown={(event) => {
          const step = { ArrowRight: [10, 0], ArrowLeft: [-10, 0], ArrowDown: [0, 10], ArrowUp: [0, -10] }[event.key];
          if (!step) return;
          event.preventDefault();
          const rect = event.currentTarget.parentElement!.getBoundingClientRect();
          const w = rect.width / displayZoom + (sx ? step[0] : 0), h = rect.height / displayZoom + (sy ? step[1] : 0);
          onResizeBlock(b.id, { shapeSize: { width: Math.round(Math.max(24, w)), height: Math.round(Math.max(24, h)) }, scale: 1 });
        }} />)}
      {editable && selected && !editing && !connectorMode && onResizeBlock && !isBoxed(b.kind) && resizeCorners.map(([label, sx, sy, classes]) => <button key={label} type="button"
        aria-label={`${label} resize handle`} className={`absolute z-20 size-3 touch-none rounded-full border-2 border-sky bg-white after:absolute after:-inset-2 after:content-[''] ${classes}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!event.isPrimary || event.button !== 0 || !width || !height) return;
          const rect = event.currentTarget.parentElement!.getBoundingClientRect();
          const origin = canvasPoint(rect.left, rect.top);
          if (!origin) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeDrag.current = { pointer: event.pointerId, origin, start: [event.clientX, event.clientY],
            span: [rect.width / (width * displayZoom), rect.height / (height * displayZoom)],
            pixels: [rect.width, rect.height], size: reflow ? rect.width / displayZoom : size };
        }}
        onPointerMove={(event) => {
          const drag = resizeDrag.current;
          if (!drag || drag.pointer !== event.pointerId) return;
          const [w, h] = drag.pixels;
          const dx = (event.clientX - drag.start[0]) * sx;
          const dy = (event.clientY - drag.start[1]) * sy;
          const next = clampSize(reflow ? drag.size + dx / displayZoom : drag.size * (1 + (dx * w + dy * h) / Math.max(1, w * w + h * h)));
          const growth = next / drag.size - 1;
          const position: Point = [drag.origin[0] - (sx < 0 ? drag.span[0] * growth : 0),
            drag.origin[1] - (!reflow && sy < 0 ? drag.span[1] * growth : 0)];
          drag.next = { size: next, position };
          setResizing({ id: b.id, ...drag.next });
        }}
        onPointerUp={(event) => {
          const drag = resizeDrag.current;
          if (drag?.pointer !== event.pointerId) return;
          resizeDrag.current = undefined;
          setResizing(undefined);
          if (drag.next && drag.next.size !== drag.size) commitSize(drag.next.size, drag.next.position);
        }}
        onLostPointerCapture={() => { resizeDrag.current = undefined; setResizing(undefined); }}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          const current = reflow ? event.currentTarget.parentElement!.getBoundingClientRect().width / displayZoom : size;
          commitSize(clampSize(current + (event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1) * (type && !reflow ? 2 : 10)));
        }} />)}
      {b.kind === "sticky" && editable && selected && !editing && onEditSticky && <div className="object-toolbar-anchor board-pop">
        <StickyTools style={b.stickyStyle}
        onChange={(stickyStyle) => onEditSticky(b.id, { stickyStyle })}
        onEdit={() => setEditingSticky(b.id)}
        onDuplicate={() => onDuplicateSticky?.(b)} onDelete={() => deleteObject(b.id)} /></div>}
      {isShape(b.kind) && editable && selected && !editing && onEditSticky && <div className="object-toolbar-anchor board-pop">
        <ShapeTools kind={b.kind} color={b.shapeColor} onChange={(shapeColor) => onEditSticky(b.id, { shapeColor })} onDelete={() => deleteObject(b.id)} /></div>}
      {editable && onMoveBlock && !editing && !((b.kind === "sticky" || isShape(b.kind)) && selected && onEditSticky) && <button type="button" aria-label="Delete note" className="absolute bottom-full left-1/2 mb-1 grid size-6 -translate-x-1/2 place-items-center rounded-full border border-stone bg-eggshell opacity-0 focus:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
        onClick={(event) => { event.stopPropagation(); deleteObject(b.id); }}>×</button>}
    </div>;
  };

  const renderLeaving = (b: Block) => {
    const type = b.kind === "text" || b.kind === "equation";
    const fontSize = b.fontSize ?? (b.kind === "equation" ? 26 : 20);
    return <div key={`leaving-${b.id}`} aria-hidden="true" data-kind={b.kind} className="block-card block-leave absolute w-fit max-w-[85%] break-words"
      style={{ width: b.kind === "text" ? b.textWidth : undefined, left: `${(b.position?.[0] ?? 0) * 100}%`, top: `${(b.position?.[1] ?? 0) * 100}%` }}>
      {type ? <div style={{ fontSize }}>{b.kind === "equation" ? <MathView tex={b.content} display={false} />
        : <div className="whitespace-pre-wrap break-words leading-snug"><BoardText content={b.content} runs={b.textRuns} /></div>}</div>
        : <div style={{ zoom: b.scale ?? 1 }}><BoardObject kind={b.kind} content={b.content} stickyStyle={b.stickyStyle} shapeSize={b.shapeSize} /></div>}
    </div>;
  };

  return (
    <div ref={boardRef} className={slide ? "relative shrink-0 self-center bg-white" : "relative min-h-[360px] flex-1 lg:min-h-[420px]"}
      style={slide ? { aspectRatio: slide.aspect, width: `min(100%, calc(${slide.maxHeight ?? "64dvh"} * ${slide.aspect}))` } : undefined}>
      <div className={slide ? "absolute inset-0 overflow-hidden" : "notebook-board notebook-board-blank absolute inset-0 overflow-hidden rounded-[18px] border border-stone"}
        style={slide ? undefined : {
          backgroundPosition: `${-targetX}px ${-targetY}px`,
          backgroundSize: `${18 * displayZoom}px ${18 * displayZoom}px`,
        }}>
        <div ref={viewport} data-board-viewport className="absolute inset-0 overflow-hidden [overflow-anchor:none]" aria-label={shapeTool ? `Drag to size ${shapeTool}` : placement ? `Click to place ${placement}` : "Board viewport"}
          tabIndex={placement || displayZoom > 1 ? 0 : undefined} style={{ touchAction: onZoom ? "none" : undefined,
            cursor: panning ? "grabbing" : !draft && (modeIcon || placement) ? boardToolCursor((modeIcon || placement)!) : active ? "crosshair" : undefined,
            // While drawing, a drag must not also select the text underneath (the highlighter used to).
            userSelect: active ? "none" : undefined, WebkitUserSelect: active ? "none" : undefined }}
          onClick={(event) => {
            const target = event.target as Element;
            if (!placement) {
              if (!target.closest("[data-block-id]")) setSelectedSticky(undefined);
              return;
            }
            if (target.closest("[data-board-editor]")) return;
            if (shapeTool || placement === "sticky") return;
            if (draft) saveDraft();
            else place(event.clientX, event.clientY);
          }}
          onKeyDown={(event) => {
            if (!placement || event.target !== event.currentTarget) return;
            if (event.key === "Escape") onCancelPlacement?.();
            if (event.key === "Enter" && !draft) {
              const bounds = event.currentTarget.getBoundingClientRect();
              place(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            }
          }}
          onContextMenu={onZoom ? (e) => e.preventDefault() : undefined}
          onScroll={(e) => {
            if (!onZoom || pan.current || pinch.current || !width || !height) return;
            const { scrollLeft, scrollTop } = e.currentTarget;
            const [appliedX, appliedY] = appliedScroll.current;
            if (Math.abs(scrollLeft - appliedX) < 1 && Math.abs(scrollTop - appliedY) < 1) return;
            onZoom(zoom, positionFromPixels(scrollLeft - left, scrollTop - top, zoom));
          }}
          onPointerDownCapture={touchDown} onPointerMoveCapture={touchMove}
          onPointerUpCapture={touchEnd} onPointerCancelCapture={touchEnd} onLostPointerCapture={(e) => { touchEnd(e); finishInk(e, false); finishShape(e, false); }}
          onPointerDown={(e) => {
            if (e.pointerType === "pen") penSeen.current = true;
            if (!e.isPrimary || e.button !== 0 || (e.pointerType === "touch" && pinch.current)) return;
            if (e.pointerType === "touch" && penSeen.current && active) return;
            if (active) { e.preventDefault(); window.getSelection()?.removeAllRanges(); }
            if (shapeTool) {
              const start = canvasPoint(e.clientX, e.clientY);
              if (!start) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              shapeDrag.current = { pointer: e.pointerId, start };
              return;
            }
            if (placement === "sticky" && !draft) {
              e.preventDefault();
              place(e.clientX, e.clientY);
              return;
            }
            if (!active) return;
            if (slide) {
              const bounds = inkLayer.current?.getBoundingClientRect();
              if (!bounds || e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) return;
            }
            // A new primary press can recover a gesture whose release was interrupted.
            e.currentTarget.setPointerCapture(e.pointerId);
            gesture.current = { id: e.pointerId, tool, ink, points: [], erased: new Set(), pressures: [] };
            setLive(null);
            setErased(new Set());
            moveInk(e);
          }}
          onPointerMove={(e) => {
            moveInk(e);
            if (shapeDrag.current?.pointer === e.pointerId) setShapePreview(currentShape(e));
          }}
          onPointerUp={(e) => { finishInk(e, true); finishShape(e, true); }}
          onPointerCancel={(e) => { finishInk(e, false); finishShape(e, false); }}>
        <div className="relative min-h-full min-w-full overflow-hidden" style={{
          width: width ? Math.max(left + width * displayZoom, width + targetX) : "100%",
          height: height ? Math.max(top + height * displayZoom, height + targetY) : "100%",
        }}>
        <div className="absolute origin-top-left" style={{ width: width || "100%", height: height || "100%", left, top, transform: `scale(${displayZoom})` }}>
        <div className={`absolute inset-0 ${slide ? "overflow-hidden" : "overflow-auto p-5 md:p-8"} ${active || placement ? "pointer-events-none" : ""}`}
          role="region" aria-label={slide ? "Presentation slide" : "Whiteboard"} tabIndex={0}>
          {slide && <img src={slide.url} alt="Lecture slide" className="absolute inset-0 h-full w-full" draggable={false} />}
          {!slide && !placement && (empty ?? (blocks.length === 0 && strokes.length === 0)) && !(isTeacher && (live?.length || connectorMode || modeIcon)) && (
            <p className="pointer-events-none grid h-full place-items-center text-center text-smoke">
              {isTeacher ? "Choose Text or Equation to add a note to the board." : "Waiting for your teacher to write something…"}
            </p>
          )}
          <div className="space-y-4">
            {blocks.filter((block) => !block.position && !block.connector).map(renderBlock)}
          </div>
        </div>
        <div className={`pointer-events-none absolute inset-0 ${active || placement ? "" : "[&>*]:pointer-events-auto"}`}>
          {blocks.filter((block) => block.position && !block.connector).map(renderBlock)}
          {leaving.map(renderLeaving)}
        </div>
        {placement === "text" && draft && onEditText && (
          <div className="board-pop absolute z-20 min-w-12 max-w-[70%] outline-2 outline-sky outline-offset-2"
            style={{ left: `${draft.position[0] * 100}%`, top: `${draft.position[1] * 100}%`, fontSize: 20 }}>
            <BoardTextEditor content="" baseSize={20} toolbarAbove={(draft.position[1] * displayZoom - viewY) * height > 60}
              onCommit={(content, runs) => {
                if (!content.trim()) { onCancelPlacement?.(); return; }
                const id = onPlace?.("text", content, draft.position, runs);
                if (id) setSelectedSticky(id);
              }} />
          </div>
        )}
        {shapePreview && <div className="pointer-events-none absolute opacity-65"
          style={{ left: `${shapePreview.position[0] * 100}%`, top: `${shapePreview.position[1] * 100}%` }}>
          <BoardObject kind={shapePreview.kind} content={shapePreview.kind} shapeSize={shapePreview.size} />
        </div>}
        {placement === "sticky" && draft && (
          <form data-board-editor className="board-pop absolute z-10 w-40 rounded bg-yellow-100 p-2 text-slate-900 shadow-md"
            style={{ left: `${draft.position[0] * 100}%`, top: `${draft.position[1] * 100}%`,
              transform: `translate(${draft.position[0] * displayZoom - viewX > .75 ? "-100%" : "0"}, ${draft.position[1] * displayZoom - viewY > .75 ? "-100%" : "0"})` }}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) saveDraft(); }}
            onSubmit={(event) => { event.preventDefault(); saveDraft(); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") { event.stopPropagation(); onCancelPlacement?.(); }
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); saveDraft(); }
            }}>
            <textarea autoFocus aria-label="Sticky note" placeholder="Write a note…" rows={4} maxLength={500}
              className="block w-full resize-none bg-[repeating-linear-gradient(transparent_0_23px,#d7b85c66_23px_24px)] px-1 leading-6 outline-none"
              value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
            <button type="submit" className="btn btn-sm btn-outline mt-1" disabled={!draft.content.trim()}>Add note</button>
          </form>
        )}
        {placement && draft && placement !== "sticky" && !(placement === "text" && onEditText) && (
          <form data-board-editor className="board-pop absolute z-10 flex max-w-[85%] items-center gap-1 rounded-xl border border-sky bg-eggshell p-1.5 shadow-lg"
            style={{ left: `${draft.position[0] * 100}%`, top: `${draft.position[1] * 100}%`,
              transform: `translate(${draft.position[0] * displayZoom - viewX > .65 ? "-100%" : "0"}, ${draft.position[1] * displayZoom - viewY > .8 ? "-100%" : "0"})` }}
            onSubmit={(event) => { event.preventDefault(); saveDraft(); }}
            onKeyDown={(event) => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); onCancelPlacement?.(); } }}>
            {placement === "equation" && <div className="eq-live" aria-live="polite">
              {draft.content.trim() ? <MathView tex={mathInputToTex(draft.content)} display={false} />
                : <span className="eq-live-hint">x^2 for powers · a/b for fractions · sqrt(x)</span>}
            </div>}
            <input autoFocus aria-label={placement === "equation" ? "Equation" : "Note text"}
              className="input !min-h-8 min-w-0 max-w-full [field-sizing:content]" size={Math.max(12, Math.min(40, draft.content.length))}
              placeholder={placement === "equation" ? "Type an equation…" : "Type a note…"} value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.content.trim()}>Add</button>
          </form>
        )}

        <svg ref={inkLayer} className={`pointer-events-none absolute inset-0 h-full w-full ${slide ? "" : "overflow-visible"}`} viewBox="0 0 1 1" preserveAspectRatio="none">
          {strokes.filter((s) => !erased.has(s.id)).map((s) => <InkPath key={s.id} stroke={s} />)}
          {live && <InkPath stroke={{ ...gesture.current?.ink, pts: live }} />}
        </svg>
        <BoardConnectors root={boardRef} plane={inkLayer} blocks={blocks} width={width} height={height} viewOrigin={[targetX / displayZoom, targetY / displayZoom]}
          selectedObject={editingText || editingSticky ? undefined : selectedSticky} enabled={!!onConnector && !active && !placement}
          drawing={!!connectorMode} canEdit={canEditBlock} onCancel={onCancelPlacement ?? (() => {})}
          onSave={(connector, id) => onConnector?.(connector, id)} onDelete={deleteObject} />
        </div>
        </div>
        </div>
      </div>
      {snipActive && (
        // The snip layer reaches a little past the board so ink right at the edge can be boxed; the box is clamped to the board.
        <div ref={snipLayer} tabIndex={-1} className="absolute -inset-3 z-30 cursor-crosshair" style={{ touchAction: "none" }} aria-label="Drag to draw a box around what you want explained"
          onPointerDown={(e) => {
            if (!e.isPrimary || e.button !== 0 || !boardRef.current) return;
            const b = boardRef.current.getBoundingClientRect();
            const x = clampTo(e.clientX - b.left, b.width), y = clampTo(e.clientY - b.top, b.height);
            // Capture keeps the box following the finger; if the browser refuses it, the box still works.
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
            setDrag({ pointer: e.pointerId, x0: x, y0: y, x1: x, y1: y });
          }}
          onPointerMove={(e) => {
            if (drag?.pointer !== e.pointerId || !boardRef.current) return;
            const b = boardRef.current.getBoundingClientRect();
            setDrag({ ...drag, x1: clampTo(e.clientX - b.left, b.width), y1: clampTo(e.clientY - b.top, b.height) });
          }}
          onPointerCancel={(e) => { if (drag?.pointer === e.pointerId) setDrag(null); }}
          onLostPointerCapture={(e) => { if (drag?.pointer === e.pointerId) setDrag(null); }}
          onPointerUp={finishSnip} onKeyDown={(e) => e.key === "Escape" && onSnip(null)}>
          <div className="pointer-events-none absolute inset-3 rounded-[18px] bg-black/5">
            {drag && <div className="snip-box absolute rounded-lg border-2 border-sky bg-sky/15" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
