"use client";

import { useEffect, useState } from "react";
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

  return <div className="mt-2 flex gap-2 overflow-x-auto lg:flex-col">
    {Array.from({ length: deck.total }, (_, index) => {
      const number = index + 1;
      const published = deck.pages[number];
      const id = (imported?.[index] ?? privatePages?.[number] ?? published)?.id;
      const preview = id && previews[id];
      const src = preview || (published && slideUrl(published));
      return <button key={number} type="button" className="notebook-thumbnail" disabled={disabled}
        aria-label={`Present slide ${number}`} aria-current={number === deck.current ? "page" : undefined}
        onClick={() => onPresent(number)}>
        <span>{number}</span>
        {src ? <img src={src} alt="" /> : <span className="notebook-page-placeholder">Slide {number}</span>}
      </button>;
    })}
  </div>;
}
