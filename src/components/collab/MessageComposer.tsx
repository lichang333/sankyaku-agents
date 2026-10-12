"use client";

import { useState, useTransition } from "react";
import { postMessageAction } from "@/app/actions-collab";
import type { ChannelType, MessageKind } from "@/lib/collaboration";

export interface CardOption {
  id: number;
  title: string;
  boardName: string;
}

export interface ReplyingMessage {
  id: number;
  text: string;
  authorDisplayName: string;
}

export default function MessageComposer({
  channelId,
  channelType,
  availableCards,
  replyingTo,
  onCancelReply,
  onMessageSent,
}: {
  channelId: number;
  channelType: ChannelType;
  availableCards: CardOption[];
  replyingTo: ReplyingMessage | null;
  onCancelReply: () => void;
  onMessageSent?: () => void;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<MessageKind>("discussion");
  const [cardId, setCardId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = text.trim();
    if (!trimmed) {
      setError("请输入消息内容");
      return;
    }
    if (trimmed.length > 12000) {
      setError("消息长度不能超过 12,000 个字符");
      return;
    }

    startTransition(async () => {
      const res = await postMessageAction(channelId, {
        text: trimmed,
        kind,
        replyToId: replyingTo ? replyingTo.id : null,
        cardId: typeof cardId === "number" ? cardId : null,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      // 成功发送：清空草稿
      setText("");
      setCardId("");
      onCancelReply();
      if (onMessageSent) onMessageSent();
    });
  };

  return (
    <div className="duo-card p-3.5 sm:p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="rounded-xl border-2 border-cardinal/30 bg-cardinal/10 p-2.5 text-xs font-bold text-cardinal">
            {error}
          </div>
        )}

        {/* 回复目标指示器 */}
        {replyingTo && (
          <div className="flex items-center justify-between rounded-xl border-2 border-beetle/30 bg-beetle/10 px-3 py-1.5 text-xs font-bold text-beetle-dark dark:text-beetle">
            <span className="truncate">
              ↩ 回复 #{replyingTo.id} ({replyingTo.authorDisplayName}): {replyingTo.text.slice(0, 45)}
              {replyingTo.text.length > 45 ? "..." : ""}
            </span>
            <button
              type="button"
              onClick={onCancelReply}
              className="ml-2 shrink-0 font-extrabold text-hare hover:text-cardinal"
              title="取消回复"
            >
              ✕
            </button>
          </div>
        )}

        {/* 消息输入框 */}
        <div>
          <textarea
            aria-label="消息内容"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入消息或结论... 支持代码与多行文本"
            maxLength={12000}
            className="duo-input w-full resize-y rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-beetle dark:border-[#37464f]"
          />
        </div>

        {/* 控制项栏：消息类型、关联卡片、发送按钮 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* 消息分类 */}
            <div className="flex items-center gap-1">
              <label htmlFor="msg-kind" className="text-[11px] font-bold text-mid">
                类型:
              </label>
              <select
                id="msg-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as MessageKind)}
                className="rounded-lg border-2 border-swan bg-[var(--card)] px-2 py-1 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
              >
                <option value="discussion">💬 讨论</option>
                <option value="question">❓ 疑问</option>
                <option value="decision">📌 决议</option>
                <option value="result">🏁 结果</option>
              </select>
            </div>

            {/* 关联卡片（仅项目和跨项目频道） */}
            {channelType !== "topic" && availableCards.length > 0 && (
              <div className="flex items-center gap-1">
                <label htmlFor="msg-card" className="text-[11px] font-bold text-mid">
                  任务卡片:
                </label>
                <select
                  id="msg-card"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="max-w-[200px] truncate rounded-lg border-2 border-swan bg-[var(--card)] px-2 py-1 text-xs font-bold outline-none focus:border-beetle dark:border-[#37464f]"
                >
                  <option value="">不关联卡片</option>
                  {availableCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} {c.title} ({c.boardName})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 发送按钮 */}
          <button
            type="submit"
            disabled={isPending || !text.trim()}
            className="btn3d bg-beetle px-4 py-1.5 text-xs text-white [--sh:var(--color-beetle-dark)]"
          >
            {isPending ? "发送中..." : "发送消息"}
          </button>
        </div>
      </form>
    </div>
  );
}
