"use client";

import { useTransition } from "react";
import { archiveCardAction } from "@/app/actions";

export default function RestoreCardButton({ cardId }: { cardId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => void (await archiveCardAction(cardId, false)))}
      className="shrink-0 rounded-lg border-2 border-beetle px-2 py-1 text-[11px] font-bold text-beetle-dark disabled:opacity-50 dark:text-beetle"
    >
      {pending ? "…" : "取回"}
    </button>
  );
}
