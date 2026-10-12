"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadOlderMessagesAction } from "@/app/actions-collab";
import { mergeLatestMessages, type MessageHistory } from "@/lib/message-history";
import { relTime } from "@/lib/dates";
import type { MessagePublic } from "@/lib/collaboration";

export default function MessageList({
  channelId,
  initialMessages,
  cardTitles,
  onSelectReply,
}: {
  channelId: number;
  initialMessages: MessagePublic[];
  cardTitles: Record<number, string>;
  onSelectReply: (msg: { id: number; text: string; authorDisplayName: string }) => void;
}) {
  const router = useRouter();
  const [history, setHistory] = useState<MessageHistory>({
    messages: initialMessages, hasMoreOlder: initialMessages.length >= 100,
  });
  const { messages, hasMoreOlder } = history;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 当外部刷新（例如 router.refresh 抓取外部 Agent 新发言）时合并新消息
  useEffect(() => {
    setHistory((prev) => mergeLatestMessages(prev, initialMessages));
  }, [initialMessages]);

  // 页面处于前台时，每 5 秒自动平滑检查一次外部 Agent 发言
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        router.refresh();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [router]);

  // 加载更早的历史消息
  const handleLoadOlder = () => {
    if (messages.length === 0) return;
    const oldestId = messages[0].id;
    setLoadError(null);

    startTransition(async () => {
      const res = await loadOlderMessagesAction(channelId, oldestId);
      if (res.error) {
        setLoadError(res.error);
        return;
      }

      const older = res.messages ?? [];
      setHistory((prev) => {
        // Ignore an older-page response overtaken by a latest-page reset.
        if (prev.messages[0]?.id !== oldestId) return prev;
        const merged = new Map(prev.messages.map((m) => [m.id, m]));
        for (const message of older) merged.set(message.id, message);
        return { messages: [...merged.values()].sort((a, b) => a.id - b.id), hasMoreOlder: older.length >= 100 };
      });
    });
  };

  const messageMap = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className="space-y-3">
      {/* 历史消息分页加载控制 */}
      {hasMoreOlder && (
        <div className="flex flex-col items-center justify-center py-1">
          <button
            type="button"
            disabled={isPending}
            onClick={handleLoadOlder}
            className="rounded-xl border-2 border-swan bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-mid hover:border-beetle hover:text-beetle-dark disabled:opacity-50 dark:border-[#37464f]"
          >
            {isPending ? "正在加载更早的消息..." : "↑ 加载更早的历史消息"}
          </button>
          {loadError && (
            <p className="mt-1 text-xs font-bold text-cardinal">加载失败：{loadError}</p>
          )}
        </div>
      )}

      {/* 消息为空的状态 */}
      {messages.length === 0 ? (
        <div className="duo-card p-8 text-center">
          <div className="text-3xl">📝</div>
          <h4 className="mt-2 text-sm font-black">频道尚无发言</h4>
          <p className="mt-1 text-xs font-bold text-hare">
            在下方输入框中发表第一条讨论、疑问、决议，或在右侧发起交接任务。
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {messages.map((msg) => {
            const isAgent = msg.authorKind === "agent";
            const repliedMsg = msg.replyToId ? messageMap.get(msg.replyToId) : undefined;

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className="duo-card p-3.5 transition-colors hover:border-mid/30"
              >
                {/* 消息元数据行 */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-bold">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {/* 发言者角色标签 */}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                        isAgent
                          ? "bg-beetle/15 text-beetle-dark dark:text-beetle"
                          : "bg-polar text-mid dark:bg-[#202f36]"
                      }`}
                    >
                      {isAgent ? "Agent" : "人类"}
                    </span>

                    {/* 显示名称 */}
                    <span className="[overflow-wrap:anywhere] font-extrabold text-[var(--text)]">
                      {msg.authorDisplayName}
                    </span>

                    {/* 消息分类标签 */}
                    {msg.kind === "discussion" && (
                      <span className="rounded bg-polar px-1 py-0.5 text-[10px] text-hare dark:bg-[#202f36]">
                        讨论
                      </span>
                    )}
                    {msg.kind === "question" && (
                      <span className="rounded bg-bee/20 px-1 py-0.5 text-[10px] text-bee-dark dark:text-bee">
                        疑问
                      </span>
                    )}
                    {msg.kind === "decision" && (
                      <span className="rounded bg-beetle/20 px-1 py-0.5 text-[10px] text-beetle-dark dark:text-beetle">
                        决议
                      </span>
                    )}
                    {msg.kind === "result" && (
                      <span className="rounded bg-macaw/20 px-1 py-0.5 text-[10px] text-macaw-dark dark:text-macaw">
                        结果
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-hare">
                    <span title={msg.createdAt}>{relTime(msg.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectReply({
                          id: msg.id,
                          text: msg.text,
                          authorDisplayName: msg.authorDisplayName,
                        })
                      }
                      className="rounded px-1 text-[10px] hover:bg-[var(--track)] hover:text-beetle-dark"
                    >
                      回复
                    </button>
                  </div>
                </div>

                {/* 被回复的原消息引用 */}
                {msg.replyToId && (
                  <div className="mt-2 rounded-lg border-l-2 border-beetle bg-[var(--track)] px-2.5 py-1 text-xs font-bold text-mid">
                    <span className="font-bold text-beetle-dark dark:text-beetle">
                      ↩ 回复 #{msg.replyToId}
                    </span>
                    {repliedMsg ? (
                      <span className="ml-1.5 truncate">
                        {repliedMsg.authorDisplayName}: {repliedMsg.text.slice(0, 50)}
                      </span>
                    ) : (
                      <span className="ml-1.5 text-hare">(原消息)</span>
                    )}
                  </div>
                )}

                {/* 关联任务卡片 */}
                {msg.cardId && cardTitles[msg.cardId] && (
                  <div className="mt-2">
                    <Link
                      href={`/c/${msg.cardId}`}
                      className="inline-flex items-center gap-1 rounded-md border border-swan bg-[var(--track)] px-2 py-0.5 text-[11px] font-bold text-beetle-dark hover:underline dark:border-[#37464f] dark:text-beetle"
                    >
                      <span>📎 任务卡片 #{msg.cardId}</span>
                      {cardTitles[msg.cardId] && (
                        <span className="max-w-[240px] truncate text-mid">
                          : {cardTitles[msg.cardId]}
                        </span>
                      )}
                    </Link>
                  </div>
                )}

                {/* 消息正文：长文本安全换行，绝不执行 HTML */}
                <div className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed font-sans text-[var(--text)]">
                  {msg.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
