import type { FeedbackEvent } from "./types";

export function checkInReceipt(events: FeedbackEvent[], questionId: string, studentId: string) {
  return events.findLast((event) =>
    event.kind === "answer" && event.questionId === questionId && event.sid === studentId
  )?.correct;
}
