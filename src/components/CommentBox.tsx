"use client";

import { useState, useTransition } from "react";
import { addCommentAction } from "@/app/actions";

export default function CommentBox({ cardId }: { cardId: number }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    setError("");
    startTransition(async () => {
      const res = await addCommentAction(cardId, t);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="说点什么（⌘/Ctrl + 回车发出）"
        className="w-full resize-none rounded-xl border-2 border-swan bg-[var(--card)] px-2.5 py-2 text-[13px] font-semibold outline-none focus:border-beetle dark:border-[#37464f]"
      />
      <div className="flex items-center gap-2">
        <button
          disabled={pending || !text.trim()}
          onClick={submit}
          className="btn3d bg-beetle px-3 py-1.5 text-xs text-white [--sh:#a568cc]"
        >
          {pending ? "发送中…" : "说"}
        </button>
        <span className="text-[11px] font-bold text-hare">
          负责人和建卡的人会收到推送
        </span>
      </div>
      {error && <p className="text-[11px] font-bold text-cardinal">{error}</p>}
    </div>
  );
}
