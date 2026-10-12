"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createChannelAction } from "@/app/actions-collab";
import type { ChannelType } from "@/lib/collaboration";

interface BoardOption {
  id: number;
  name: string;
  visibility: string;
}

export default function CreateChannelForm({ boards }: { boards: BoardOption[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState<ChannelType>("project");
  const [singleBoardId, setSingleBoardId] = useState<number | "">(
    boards.length > 0 ? boards[0].id : "",
  );
  const [bridgeBoardIds, setBridgeBoardIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggleBridgeBoard = (boardId: number) => {
    setBridgeBoardIds((prev) =>
      prev.includes(boardId) ? prev.filter((id) => id !== boardId) : [...prev, boardId],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请输入频道名称");
      return;
    }
    if (trimmedName.length > 200) {
      setError("频道名称不能超过 200 个字符");
      return;
    }

    let boardIds: number[] = [];
    if (type === "project") {
      if (typeof singleBoardId !== "number") {
        setError("项目协作频道需选择 1 个关联项目看板");
        return;
      }
      boardIds = [singleBoardId];
    } else if (type === "bridge") {
      if (bridgeBoardIds.length < 2) {
        setError("跨项目协同频道需至少关联 2 个项目看板");
        return;
      }
      if (bridgeBoardIds.length > 10) {
        setError("跨项目协同频道最多关联 10 个项目看板");
        return;
      }
      boardIds = bridgeBoardIds;
    }

    startTransition(async () => {
      const res = await createChannelAction({
        name: trimmedName,
        summary: summary.trim(),
        type,
        boardIds,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.channel) {
        setName("");
        setSummary("");
        setIsOpen(false);
        router.push(`/collab/${res.channel.id}`);
      }
    });
  };

  if (!isOpen) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="btn3d inline-flex items-center gap-2 bg-beetle px-4 py-2.5 text-xs text-white [--sh:var(--color-beetle-dark)]"
        >
          <span>＋</span>
          <span>创建协作频道</span>
        </button>
      </div>
    );
  }

  return (
    <div className="duo-card mt-3 p-4 sm:p-5">
      <div className="flex items-center justify-between border-b-2 border-swan pb-3 dark:border-[#37464f]">
        <h3 className="text-sm font-black">创建协作频道</h3>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          className="text-xs font-bold text-hare hover:text-mid"
        >
          取消
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {error && (
          <div className="rounded-xl border-2 border-cardinal/30 bg-cardinal/10 p-3 text-xs font-bold text-cardinal">
            {error}
          </div>
        )}

        {/* 频道名称 */}
        <div>
          <label htmlFor="channel-name" className="block text-xs font-extrabold text-mid">
            频道名称 <span className="text-cardinal">*</span>
          </label>
          <input
            id="channel-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：主线联调、版本发布对齐、算法方案讨论"
            maxLength={200}
            className="duo-input mt-1.5 w-full rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
          />
        </div>

        {/* 频道类型 */}
        <div>
          <label className="block text-xs font-extrabold text-mid">频道类型</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setType("project")}
              className={`flex flex-col rounded-xl border-2 p-3 text-left transition-colors ${
                type === "project"
                  ? "border-macaw bg-macaw/10 dark:border-macaw"
                  : "border-swan hover:border-mid dark:border-[#37464f]"
              }`}
            >
              <span className="text-xs font-black text-macaw-dark dark:text-macaw">
                📌 项目协作 (Project)
              </span>
              <span className="mt-1 text-[11px] font-bold text-hare">
                关联 1 个项目看板，围绕任务推进
              </span>
            </button>

            <button
              type="button"
              onClick={() => setType("topic")}
              className={`flex flex-col rounded-xl border-2 p-3 text-left transition-colors ${
                type === "topic"
                  ? "border-bee bg-bee/10 dark:border-bee"
                  : "border-swan hover:border-mid dark:border-[#37464f]"
              }`}
            >
              <span className="text-xs font-black text-bee-dark dark:text-bee">
                💬 议题讨论 (Topic)
              </span>
              <span className="mt-1 text-[11px] font-bold text-hare">
                无项目绑定，对全体成员开放
              </span>
            </button>

            <button
              type="button"
              onClick={() => setType("bridge")}
              className={`flex flex-col rounded-xl border-2 p-3 text-left transition-colors ${
                type === "bridge"
                  ? "border-beetle bg-beetle/10 dark:border-beetle"
                  : "border-swan hover:border-mid dark:border-[#37464f]"
              }`}
            >
              <span className="text-xs font-black text-beetle-dark dark:text-beetle">
                🌉 跨项目协同 (Bridge)
              </span>
              <span className="mt-1 text-[11px] font-bold text-hare">
                关联 2–10 个项目，需同时拥有查看权限
              </span>
            </button>
          </div>
        </div>

        {/* 项目看板关联 */}
        {type === "topic" && (
          <div className="rounded-xl border-2 border-swan bg-[var(--track)] p-3 text-xs font-bold text-hare dark:border-[#37464f]">
            💡 议题讨论频道不关联具体看板，全体成员均可查看与发言。
          </div>
        )}

        {type === "project" && (
          <div>
            <label htmlFor="select-board" className="block text-xs font-extrabold text-mid">
              关联项目看板 <span className="text-cardinal">*</span>
            </label>
            {boards.length === 0 ? (
              <p className="mt-1.5 text-xs font-bold text-cardinal">
                当前没有可用的项目看板，请先在看板首页创建一块板。
              </p>
            ) : (
              <select
                id="select-board"
                value={singleBoardId}
                onChange={(e) => setSingleBoardId(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.visibility === "private" ? "(私人)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {type === "bridge" && (
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-mid">
                关联项目看板（选择 2 至 10 个） <span className="text-cardinal">*</span>
              </label>
              <span className="text-xs font-black text-beetle-dark dark:text-beetle">
                已选 {bridgeBoardIds.length} 个
              </span>
            </div>
            {boards.length < 2 ? (
              <p className="mt-1.5 text-xs font-bold text-cardinal">
                跨项目协同需要至少 2 块可选项目看板（当前仅有 {boards.length} 块）。
              </p>
            ) : (
              <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border-2 border-swan p-2 dark:border-[#37464f]">
                {boards.map((b) => {
                  const checked = bridgeBoardIds.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        checked
                          ? "bg-beetle/15 text-beetle-dark dark:text-beetle"
                          : "hover:bg-[var(--track)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleBridgeBoard(b.id)}
                        className="rounded"
                      />
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      {b.visibility === "private" && (
                        <span className="shrink-0 text-[10px] text-hare">私人</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 频道描述 / 摘要 */}
        <div>
          <label htmlFor="channel-summary" className="block text-xs font-extrabold text-mid">
            频道说明 / 摘要（可选）
          </label>
          <textarea
            id="channel-summary"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="简要说明此频道的协作目标或对齐范围..."
            maxLength={2000}
            className="duo-input mt-1.5 w-full rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setIsOpen(false);
              setError(null);
            }}
            className="rounded-xl px-4 py-2 text-xs font-bold text-hare hover:text-mid"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isPending || (type === "project" && boards.length === 0) || (type === "bridge" && boards.length < 2)}
            className="btn3d bg-beetle px-5 py-2 text-xs text-white [--sh:var(--color-beetle-dark)]"
          >
            {isPending ? "创建中..." : "确定创建"}
          </button>
        </div>
      </form>
    </div>
  );
}
