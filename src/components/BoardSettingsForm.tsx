"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveBoardAction, deleteBoardAction, updateBoardAction } from "@/app/actions";
import type { Board } from "@/lib/types";

export default function BoardSettingsForm({
  board,
  canEdit,
  canDelete,
}: {
  board: Board;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(board.name);
  const [desc, setDesc] = useState(board.description ?? "");
  const [aging, setAging] = useState(String(board.agingDays));
  const [priv, setPriv] = useState(board.visibility === "private");
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const field =
    "w-full rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-sm font-bold outline-none focus:border-beetle disabled:opacity-60 dark:border-[#37464f]";

  const save = () =>
    startTransition(async () => {
      const res = await updateBoardAction(board.id, {
        name,
        description: desc.trim() || null,
        agingDays: Number(aging) || 7,
        visibility: priv ? "private" : "group",
      });
      setMsg(res?.error ? { error: res.error } : { ok: true });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-black text-hare">板名</span>
        <input
          disabled={!canEdit}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-black text-hare">一句话说明</span>
        <input
          disabled={!canEdit}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="这块板管的是哪件事"
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-black text-hare">
          待几天算「躺太久」
        </span>
        <input
          disabled={!canEdit}
          inputMode="numeric"
          value={aging}
          onChange={(e) => setAging(e.target.value.replace(/\D/g, ""))}
          className={field}
        />
        <span className="mt-1 block text-[11px] font-bold text-hare">
          卡片在同一列超过这么多天，卡上出现 ◷ 标记；到两倍就进首页的「该管一管的」。
          节奏快的板填 3，慢的填 14。
        </span>
      </label>

      <label className="flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={priv}
          onChange={(e) => setPriv(e.target.checked)}
          className="h-4 w-4 accent-[#ce82ff]"
        />
        私人板（只有你看得见，也不进动态流）
      </label>

      {canEdit && (
        <div className="flex items-center gap-2 pt-1">
          <button
            disabled={pending}
            onClick={save}
            className="btn3d bg-beetle px-4 py-2 text-sm text-white [--sh:#a568cc]"
          >
            {pending ? "存中…" : "存下"}
          </button>
          {msg.ok && <span className="text-[11px] font-bold text-feather">已存 ✓</span>}
          {msg.error && <span className="text-[11px] font-bold text-cardinal">{msg.error}</span>}
        </div>
      )}

      {canEdit && (
        <div className="border-t-2 border-swan pt-3 dark:border-[#37464f]">
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await archiveBoardAction(board.id, !board.archivedAt);
                router.push("/");
              })
            }
            className="rounded-xl border-2 border-swan px-3 py-1.5 text-xs font-bold dark:border-[#37464f]"
          >
            {board.archivedAt ? "↩︎ 取消归档" : "🗄 归档整块板"}
          </button>

          {canDelete && (
            <div className="mt-2">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={pending}
                    onClick={() => startTransition(async () => void (await deleteBoardAction(board.id)))}
                    className="rounded-xl bg-cardinal px-3 py-1.5 text-xs font-bold text-white"
                  >
                    真删「{board.name}」，连同所有卡片和履历
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs font-bold text-hare"
                  >
                    算了
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold text-cardinal"
                >
                  删除整块板
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
