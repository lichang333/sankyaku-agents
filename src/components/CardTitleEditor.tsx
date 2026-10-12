"use client";

import { useEffect, useState, useTransition } from "react";
import { updateCardAction } from "@/app/actions";
import { useAutoFocus } from "@/components/useAutoFocus";

export default function CardTitleEditor({ cardId, title }: { cardId: number; title: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [pending, startTransition] = useTransition();
  const focusRef = useAutoFocus<HTMLTextAreaElement>();

  useEffect(() => setValue(title), [title]);

  const save = () => {
    const t = value.trim();
    if (!t || t === title) {
      setValue(title);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await updateCardAction(cardId, { title: t });
      setEditing(false);
    });
  };

  if (!editing)
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full text-left text-lg leading-snug font-black"
      >
        {title}
      </button>
    );

  return (
    <textarea
      ref={focusRef}
      rows={2}
      value={value}
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") (setValue(title), setEditing(false));
      }}
      className="w-full resize-none rounded-xl border-2 border-beetle bg-[var(--card)] px-2.5 py-1.5 text-lg font-black outline-none"
    />
  );
}
