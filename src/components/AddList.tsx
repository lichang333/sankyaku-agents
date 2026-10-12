"use client";

import { useState, useTransition } from "react";
import { createListAction } from "@/app/actions";
import { useAutoFocus } from "@/components/useAutoFocus";

export default function AddList({ boardId }: { boardId: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const focusRef = useAutoFocus<HTMLInputElement>();

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    setName("");
    startTransition(async () => {
      await createListAction(boardId, n);
      setOpen(false);
    });
  };

  return (
    <div className="lane-slot">
      {open ? (
        <div className="rounded-2xl bg-[var(--lane)] p-2">
          <input
            ref={focusRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.repeat && !e.nativeEvent.isComposing) submit();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="列名，比如「等评审」"
            className="w-full rounded-xl border-2 border-beetle bg-[var(--card)] px-2.5 py-2 text-[13px] font-bold outline-none"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              disabled={pending || !name.trim()}
              onClick={submit}
              className="btn3d bg-beetle px-3 py-1.5 text-xs text-white [--sh:#a568cc]"
            >
              加上
            </button>
            <button onClick={() => setOpen(false)} className="text-xs font-bold text-hare">
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl border-2 border-dashed border-swan px-3 py-3 text-xs font-bold text-hare transition-colors hover:border-beetle hover:text-beetle dark:border-[#37464f]"
        >
          ＋ 加一列
        </button>
      )}
    </div>
  );
}
