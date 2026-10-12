"use client";

import Mascot, { type MascotVariant } from "@/components/Mascot";
import { labelChipStyle, type Label, type User } from "@/lib/types";

export interface Filter {
  assignee: string | null;
  labelId: number | null;
}

/**
 * 筛选条。只有两个维度：谁负责、什么标签。
 * 没做「按到期筛」——那件事在「我的」页面做得更好，
 * 板是用来看流动的，把板筛成一份清单等于把它变回清单。
 */
export default function BoardFilters({
  users,
  labels,
  value,
  onChange,
  total,
}: {
  users: User[];
  labels: Label[];
  value: Filter;
  onChange: (f: Filter) => void;
  total: number;
}) {
  const chip = "rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors";
  const on = "bg-beetle text-white";
  const off = "bg-[var(--track)] text-mid";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-bold text-hare">{total} 张</span>

      {users.map((u) => {
        const active = value.assignee === u.id;
        return (
          <button
            key={u.id}
            onClick={() => onChange({ ...value, assignee: active ? null : u.id })}
            className={`flex items-center gap-1 ${chip} ${active ? on : off}`}
            title={`只看 ${u.displayName} 的卡`}
          >
            <Mascot className="h-4 w-4" variant={u.id as MascotVariant} />
            {u.displayName}
          </button>
        );
      })}

      {labels.map((l) => {
        const active = value.labelId === l.id;
        const c = labelChipStyle(l.color, active);
        return (
          <button
            key={l.id}
            onClick={() => onChange({ ...value, labelId: active ? null : l.id })}
            className={`${chip} ${c.className}`}
            style={c.style}
          >
            {l.name}
          </button>
        );
      })}

      {(value.assignee || value.labelId) && (
        <button
          onClick={() => onChange({ assignee: null, labelId: null })}
          className={`${chip} border-2 border-swan text-hare dark:border-[#37464f]`}
        >
          ✕ 清掉筛选
        </button>
      )}
    </div>
  );
}
