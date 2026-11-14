export type BlockKind = "text" | "equation";
export interface Block { id: string; topicId: string; kind: BlockKind; content: string; order: number; ts: number }
export interface Topic { id: string; title: string; summary: string; ts: number; auto: boolean }
export interface Stroke { id: string; pts: [number, number][] }
export interface RoomState {
  code: string; title: string; blocks: Block[]; topics: Topic[]; strokes: Stroke[];
  currentTopicId: string | null; ended: boolean; rev: number;
  spotlight?: { blockId: string; ts: number } | null;
  question?: { id: string; text: string; ts: number; open: boolean } | null;
  subject?: string;
}
export interface FeedbackEvent { id: string; sid: string; kind: "ask" | "confused" | "helped" | "answer"; blockId: string | null; topicId: string | null; ts: number; correct?: boolean; questionId?: string }
export type Mode = "standard" | "focus" | "guided" | "example";
export interface Prefs { mode: Mode; textSize: number; reduceMotion: boolean; popups: boolean; scores: Record<Mode, number> }
export const DEFAULT_PREFS: Prefs = { mode: "standard", textSize: 100, reduceMotion: false, popups: true, scores: { standard: 0, focus: 0, guided: 0, example: 0 } };
export type AIKind = "explain" | "why" | "simplify" | "example" | "snip" | "followup" | "another" | "summarize" | "catchup" | "deeper" | "clarify" | "graph" | "visual" | "quiz";
export interface AIRequest {
  kind: AIKind; selected: string[]; context: string[]; topicTitle?: string; topics?: { title: string; summary: string }[];
  mode: Mode; image?: string; question?: string; history?: { role: "user" | "assistant"; text: string }[]; detail?: "short" | "long"; stats?: string;
}
export interface AIResponse { text: string; title?: string; summary?: string; data?: unknown; source: "ai" | "demo"; error?: string }
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
