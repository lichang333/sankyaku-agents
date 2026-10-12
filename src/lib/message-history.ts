import type { MessagePublic } from "./collaboration";

export type MessageHistory = { messages: MessagePublic[]; hasMoreOlder: boolean };

// A latest-page refresh may jump beyond the retained history. Start from that
// page again so backward paging can fill the gap, rather than silently skip it.
export function mergeLatestMessages(previous: MessageHistory, latest: MessagePublic[]): MessageHistory {
  if (latest.length === 0) return { messages: [], hasMoreOlder: false };
  const existing = new Set(previous.messages.map((m) => m.id));
  if (previous.messages.length === 0 ||
      (latest.length >= 100 && !latest.some((m) => existing.has(m.id)))) {
    return { messages: latest, hasMoreOlder: latest.length >= 100 };
  }
  const merged = new Map(previous.messages.map((m) => [m.id, m]));
  for (const message of latest) merged.set(message.id, message);
  return { messages: [...merged.values()].sort((a, b) => a.id - b.id), hasMoreOlder: previous.hasMoreOlder };
}
