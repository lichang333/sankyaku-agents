"use client";

import { useState, useTransition } from "react";
import { createCardAction } from "@/app/actions";
import { useAutoFocus } from "@/components/useAutoFocus";

/**
 * 列底的内联加卡。
 * 回车提交后输入框留在原地继续开着——加卡片这件事很少只做一次，
 * 每加一张都要重新点一下「＋」是最烦人的那种设计。
 */
export default function AddCard({ listId, disabled }: { listId: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const focusRef = useAutoFocus<HTMLTextAreaElement>();

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    setError("");
    startTransition(async () => {
      const res = await createCardAction(listId, t);
      if (res?.error) setError(res.error);
    });
  };

  if (!open)
    return (
      <button
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="mx-0.5 my-2 rounded-xl px-2 py-1.5 text-left text-xs font-bold text-hare transition-colors hover:bg-[var(--card)] disabled:opacity-40"
      >
        ＋ 加一张卡
      </button>
    );

  return (
    <div className="mx-0.5 my-2 space-y-1.5">
      <textarea
        ref={focusRef}
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.repeat && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="要做什么？回车加下一张"
        className="w-full resize-none rounded-xl border-2 border-beetle bg-[var(--card)] px-2.5 py-2 text-[13px] font-bold outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          disabled={pending || !title.trim()}
          onClick={submit}
          className="btn3d bg-beetle px-3 py-1.5 text-xs text-white [--sh:#a568cc]"
        >
          加上
        </button>
        <button
          onClick={() => (setOpen(false), setTitle(""))}
          className="text-xs font-bold text-hare"
        >
          收起
        </button>
      </div>
      {error && <p className="text-[11px] font-bold text-cardinal">{error}</p>}
    </div>
  );
}
