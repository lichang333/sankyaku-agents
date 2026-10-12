"use client";

import { useTransition } from "react";
import { toggleCardLabelAction } from "@/app/actions";
import { labelChipStyle, type Label } from "@/lib/types";

export default function LabelPicker({
  cardId,
  all,
  on,
}: {
  cardId: number;
  all: Label[];
  on: Label[];
}) {
  const [pending, startTransition] = useTransition();
  const active = new Set(on.map((l) => l.id));

  if (all.length === 0)
    return (
      <p className="text-[11px] font-bold text-hare">这块板还没有标签，去板设置里加。</p>
    );

  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((l) => {
        const isOn = active.has(l.id);
        const chip = labelChipStyle(l.color, isOn);
        return (
          <button
            key={l.id}
            disabled={pending}
            onClick={() =>
              startTransition(async () => void (await toggleCardLabelAction(cardId, l.id, !isOn)))
            }
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-opacity disabled:opacity-50 ${chip.className}`}
            style={chip.style}
          >
            {isOn && "✓ "}
            {l.name}
          </button>
        );
      })}
    </div>
  );
}
