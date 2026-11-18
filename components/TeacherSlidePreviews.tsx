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
  useEffect(() => { setChosen(undefined); }, [deck.current]);
  useEffect(() => { if (!disabled) setChosen(undefined); }, [disabled]);
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

  return <div ref={list} className="slide-list mt-2 flex gap-2 overflow-x-auto lg:flex-col">
    {marker && <span aria-hidden="true" className="slide-list-marker" data-jump={marker.jump}
      style={{ width: marker.w, height: marker.h, transform: `translate(${marker.x}px, ${marker.y}px)` }} />}
    {Array.from({ length: deck.total }, (_, index) => {
      const number = index + 1;
      const published = deck.pages[number];
      const id = (imported?.[index] ?? privatePages?.[number] ?? published)?.id;
      const preview = id && previews[id];
      const src = preview || (published && slideUrl(published));
      return <button key={number} type="button" className="notebook-thumbnail" disabled={disabled} data-slide={number}
        aria-label={`Present slide ${number}`} aria-current={number === deck.current ? "page" : undefined}
        onClick={() => { if (number !== deck.current) setChosen(number); onPresent(number); }}>
        <span>{number}</span>
        {src ? <img src={src} alt="" /> : <span className="notebook-page-placeholder">Slide {number}</span>}
      </button>;
    })}
  </div>;
}
