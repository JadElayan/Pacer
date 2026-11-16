"use client";
import { ChoiceMenu } from "./ChoiceMenu";

import { useEffect, useState } from "react";
import { slideUrl, type SlideDeck, type SlidePage } from "@/lib/slides";
import { restoreSlide } from "@/lib/teacherStorage";
import { InkPath } from "./InkPath";

function SavedSlideImage({ slide, number, deckId, userId }: {
  slide: SlidePage; number: number; deckId: string; userId?: string;
}) {
  const [src, setSrc] = useState(userId ? "" : slideUrl(slide));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let objectUrl: string | undefined;
    void restoreSlide(userId, deckId, slide).then(({ image }) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(image);
      setSrc(objectUrl);
    }).catch(() => {
      if (active) setSrc(slideUrl(slide));
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, deckId, slide]);

  if (failed) return <p className="p-4 text-sm">This slide image is unavailable.</p>;
  if (!src) return <p className="p-4 text-sm" role="status">Loading slide…</p>;
  return <img src={src} alt={`Saved lecture slide ${number}`} className="h-full w-full" onError={() => setFailed(true)} />;
}

export function SavedSlides({ deck, userId }: { deck: SlideDeck; userId?: string }) {
  const [selected, setSelected] = useState<number>();
  const numbers = Object.keys(deck.pages).map(Number);
  const number = selected && deck.pages[selected] ? selected : numbers[0];
  const slide = deck.pages[number];
  if (!slide) return null;
  return <div className="space-y-2">
    <div className="flex items-center gap-2 text-sm">Saved slides
      <ChoiceMenu label="Saved slides" value={number} onChange={(value) => setSelected(Number(value))}>
        {numbers.map((n) => <option key={n} value={n}>Slide {n}</option>)}
      </ChoiceMenu></div>
    <div className="relative overflow-hidden rounded-xl border border-stone bg-white" style={{ aspectRatio: slide.width / slide.height }}>
      <SavedSlideImage key={`${userId ?? "guest"}:${slide.id}`} slide={slide} number={number} deckId={deck.id} userId={userId} />
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        {(deck.ink[number] ?? []).map((stroke) => <InkPath key={stroke.id} stroke={stroke} />)}
      </svg>
    </div>
  </div>;
}
