export function privateNoteKey(room: string, userId?: string) {
  return `pacer:student-notes:${encodeURIComponent(room)}:${encodeURIComponent(userId ?? "guest")}`;
}
