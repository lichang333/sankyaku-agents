"use client";

import { useState, useTransition } from "react";
import {
  addCheckItemAction,
  deleteCheckItemAction,
  toggleCheckItemAction,
} from "@/app/actions";
import type { CheckItem } from "@/lib/types";

/** 卡片里的小清单。一张卡拆几步就够了，不做嵌套。 */
export default function Checklist({ cardId, items }: { cardId: number; items: CheckItem[] }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const done = items.filter((i) => i.done).length;

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    startTransition(async () => void (await addCheckItemAction(cardId, t)));
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--track)]">
              <i
                className="block h-full rounded-full bg-feather transition-[width] duration-300"
                style={{ width: `${(done / items.length) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-bold text-hare">
              {done}/{items.length}
            </span>
          </div>

          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.id} className="group flex items-center gap-2">
                <button
                  disabled={pending}
                  onClick={() =>
                    startTransition(
                      async () => void (await toggleCheckItemAction(cardId, it.id, !it.done))
                    )
                  }
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-black transition-colors ${
                    it.done
                      ? "border-feather bg-feather text-white"
                      : "border-swan dark:border-[#37464f]"
                  }`}
                  aria-label={it.done ? "标为未完成" : "标为完成"}
                >
                  {it.done && "✓"}
                </button>
                <span
                  className={`min-w-0 flex-1 text-[13px] font-semibold ${
                    it.done ? "text-hare line-through" : ""
                  }`}
                >
                  {it.text}
                </span>
                <button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => void (await deleteCheckItemAction(cardId, it.id)))
                  }
                  className="shrink-0 px-1 text-[11px] font-bold text-hare opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="删掉这一条"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
        placeholder="＋ 拆一步，回车加下一条"
        className="w-full rounded-xl border-2 border-swan bg-transparent px-2.5 py-1.5 text-[13px] font-semibold outline-none placeholder:text-hare focus:border-beetle dark:border-[#37464f]"
      />
    </div>
  );
}
