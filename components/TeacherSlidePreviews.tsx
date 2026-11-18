"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { recoverDeck } from "@/lib/importLecture";
import { slideUrl, type LocalSlide, type SlideDeck, type SlidePage } from "@/lib/slides";
import { restoreSlide } from "@/lib/teacherStorage";

export function TeacherSlidePreviews({ deck, imported, privatePages, storageOwner, disabled, onPresent }: {
  deck: SlideDeck;
  imported?: LocalSlide[];
  privatePages?: SlideDeck["pages"];
  storageOwner?: string;
  disabled: boolean;
  onPresent: (page: number) => void;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    const urls: Record<string, string> = {};
    let closed = false;
    const add = ({ id, image }: LocalSlide) => { urls[id] = URL.createObjectURL(image); };
    const load = async () => {
      const local = imported ?? await recoverDeck(deck.id).catch(() => undefined);
      if (closed) return;
      if (local?.length) {
        local.forEach(add);
        setPreviews({ ...urls });
        return;
      }
      if (!storageOwner || !privatePages) return;
      const pages: SlidePage[] = Object.values(privatePages);
      await Promise.all(Array.from({ length: Math.min(4, pages.length) }, async () => {
        while (!closed && pages.length) {
          const page = pages.shift()!;
          const loaded = await restoreSlide(storageOwner, deck.id, page).catch(() => undefined);
          if (!closed && loaded) {
            add(loaded);
            setPreviews({ ...urls });
          }
        }
      }));
    };
    void load();
    return () => {
      closed = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [deck.id, imported, privatePages, storageOwner]);

  // The highlight slides to the clicked slide right away, before the slide finishes opening.
  const list = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<number>();
  const target = chosen ?? deck.current;
  // A slide asked for while another was still opening (holding an arrow key) opens as soon as that one is done.
  const queued = useRef<number | undefined>(undefined);
  useEffect(() => { if (!queued.current) setChosen(undefined); }, [deck.current]);
  useEffect(() => {
    if (disabled) return;
    const next = queued.current;
    queued.current = undefined;
    if (next && next !== deck.current) onPresent(next);
    else setChosen(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  const [marker, setMarker] = useState<{ x: number; y: number; w: number; h: number; jump: boolean }>();
  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const place = () => {
      const button = root.querySelector<HTMLElement>(`[data-slide="${target}"]`);
      if (!button) { setMarker(undefined); return; }
      setMarker((prev) => ({ x: button.offsetLeft, y: button.offsetTop, w: button.offsetWidth, h: button.offsetHeight, jump: !prev }));
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(root);
    return () => resize.disconnect();
  }, [target, deck.total]);

  // Arrow keys move through slides while a thumbnail has focus. At the first or last slide the list gives a small bump
  // instead of scrolling the panel.
  const [bump, setBump] = useState<"start" | "end">();
  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1
      : event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : 0;
    if (!step || !(event.target instanceof HTMLElement) || !event.target.dataset.slide) return;
    event.preventDefault();
    const from = target;
    const next = Math.min(deck.total, Math.max(1, Number.isFinite(step) ? from + step : step > 0 ? deck.total : 1));
    if (next === from) {
      setBump(undefined);
      requestAnimationFrame(() => setBump(step > 0 ? "end" : "start"));
      return;
    }
    const button = list.current?.querySelector<HTMLElement>(`[data-slide="${next}"]`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (next !== deck.current) setChosen(next);
    if (disabled) queued.current = next;
    else onPresent(next);
  };

  return <div ref={list} className="slide-list mt-2 flex gap-2 overflow-x-auto lg:flex-col" data-bump={bump}
    onKeyDown={onKey} onAnimationEnd={() => setBump(undefined)}>
    {marker && <span aria-hidden="true" className="slide-list-marker" data-jump={marker.jump}
      style={{ width: marker.w, height: marker.h, transform: `translate(${marker.x}px, ${marker.y}px)` }} />}
    {Array.from({ length: deck.total }, (_, index) => {
      const number = index + 1;
      const published = deck.pages[number];
      const id = (imported?.[index] ?? privatePages?.[number] ?? published)?.id;
      const preview = id && previews[id];
      const src = preview || (published && slideUrl(published));
      return <button key={number} type="button" className="notebook-thumbnail" aria-disabled={disabled || undefined} data-slide={number}
        aria-label={`Present slide ${number}`} tabIndex={number === target ? 0 : -1} aria-current={number === deck.current ? "page" : undefined}
        onClick={() => { if (disabled) return; if (number !== deck.current) setChosen(number); onPresent(number); }}>
        <span>{number}</span>
        {deck.hidden?.includes(number) && <span className="notebook-thumbnail-hidden" title="Hidden from students until you present it">Hidden</span>}
        {src ? <img src={src} alt="" /> : <span className="notebook-page-placeholder">Slide {number}</span>}
      </button>;
    })}
  </div>;
}
