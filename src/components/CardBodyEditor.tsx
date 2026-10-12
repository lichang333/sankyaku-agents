"use client";

import { useEffect, useState, useTransition } from "react";
import { updateCardAction } from "@/app/actions";
import { useAutoFocus } from "@/components/useAutoFocus";
import RichText from "@/components/RichText";

export default function CardBodyEditor({
  cardId,
  body,
}: {
  cardId: number;
  body: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(body ?? "");
  const [pending, startTransition] = useTransition();
  const focusRef = useAutoFocus<HTMLTextAreaElement>();

  useEffect(() => setValue(body ?? ""), [body]);

  const save = () => {
    const v = value.trim();
    if (v === (body ?? "")) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await updateCardAction(cardId, { body: v || null });
      setEditing(false);
    });
  };

  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className="w-full text-left">
        {body ? (
          <RichText text={body} />
        ) : (
          <span className="text-[13px] font-bold text-hare">＋ 补一句说明</span>
        )}
      </button>
    );

  return (
    <div className="space-y-2">
      <textarea
        ref={focusRef}
        rows={5}
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (setValue(body ?? ""), setEditing(false))}
        placeholder="为什么要做这件事、做到什么算完、卡在哪儿"
        className="w-full resize-y rounded-xl border-2 border-beetle bg-[var(--card)] px-2.5 py-2 text-[13px] font-semibold outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          onClick={save}
          className="btn3d bg-beetle px-3 py-1.5 text-xs text-white [--sh:#a568cc]"
        >
          存下
        </button>
        <button
          onClick={() => (setValue(body ?? ""), setEditing(false))}
          className="text-xs font-bold text-hare"
        >
          取消
        </button>
      </div>
    </div>
  );
}
