/** Renders **bold** markers from AI answers as real bold text (no other markdown, so nothing unsafe is injected). */
export function RichText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.length > 4 && p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>;
}
