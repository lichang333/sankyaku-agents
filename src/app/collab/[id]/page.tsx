import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AgentGrantManager from "@/components/collab/AgentGrantManager";
import ChannelChatView from "@/components/collab/ChannelChatView";
import HandoffSection from "@/components/collab/HandoffSection";
import type { CardOption } from "@/components/collab/MessageComposer";
import {
  listChannelAgents,
  listChannelHandoffs,
  listChannels,
  listEligibleAgents,
  listMessages,
  type Principal,
} from "@/lib/collaboration";
import { getSessionUser } from "@/lib/current-user";
import { getBoard, getBoardViews } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const channelId = Number(id);
  if (!Number.isSafeInteger(channelId) || channelId < 1) notFound();

  const principal: Principal = { kind: "human", id: user.id };

  // 安全检查：只有有权访问的频道才能找到
  const accessibleChannels = listChannels(principal);
  const channel = accessibleChannels.find((c) => c.id === channelId);
  if (!channel) notFound();

  // 加载最新消息（按时间升序）
  const initialMessages = listMessages(principal, channelId, { latest: true, limit: 100 });

  // 加载交接任务
  const handoffs = listChannelHandoffs(principal, channelId);

  // 加载已授权进入此频道的 Agent 成员
  const grantedAgents = listChannelAgents(principal, channelId);

  // 成员与创建者：加载候选可授权 Agent 列表（成员仅可见自己的 Agent，创建者还可见其他成员已授权的 Agent）
  const isCreator = channel.creatorId === user.id;
  const eligibleAgents = listEligibleAgents(principal, channelId);

  // 获取关联看板与可用卡片
  const linkedBoards = channel.boardIds
    .map((bid) => getBoard(bid))
    .filter((b): b is NonNullable<typeof b> => b !== null && !b.archivedAt);

  const boardViews = channel.boardIds.length > 0 ? getBoardViews(channel.boardIds) : [];
  const availableCards: CardOption[] = [];
  const cardTitles: Record<number, string> = {};

  for (const bv of boardViews) {
    for (const list of bv.lists) {
      for (const card of list.cards) {
        cardTitles[card.id] = card.title;
        availableCards.push({
          id: card.id,
          title: card.title,
          boardName: bv.name,
        });
      }
    }
  }

  const isProject = channel.type === "project";
  const isTopic = channel.type === "topic";
  const typeBadgeBg = isProject
    ? "bg-macaw/15 text-macaw-dark dark:text-macaw"
    : isTopic
      ? "bg-bee/15 text-bee-dark dark:text-bee"
      : "bg-beetle/15 text-beetle-dark dark:text-beetle";
  const typeLabel = isProject ? "项目协作" : isTopic ? "议题讨论" : "跨项目协同";

  return (
    <div className="mx-auto max-w-4xl space-y-4 lg:max-w-6xl">
      {/* 头部面包屑与频道信息 */}
      <div className="duo-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-swan pb-3 dark:border-[#37464f]">
          <Link
            href="/collab"
            className="inline-flex items-center gap-1 text-xs font-bold text-hare hover:text-beetle-dark dark:hover:text-beetle"
          >
            <span>←</span>
            <span>返回协作空间</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-xs font-black ${typeBadgeBg}`}>
              {typeLabel}
            </span>
            <span className="text-xs font-bold text-hare">#{channel.id}</span>
          </div>
        </div>

        <div className="mt-3">
          <h2 className="[overflow-wrap:anywhere] text-lg font-black tracking-wide sm:text-xl">{channel.name}</h2>
          {channel.summary ? (
            <p className="mt-1 [overflow-wrap:anywhere] text-sm text-hare">{channel.summary}</p>
          ) : (
            <p className="mt-1 text-xs font-bold text-hare/60 italic">暂无频道摘要</p>
          )}

          {/* 关联项目看板链接 */}
          {linkedBoards.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-mid">
              <span className="text-hare">关联项目看板:</span>
              {linkedBoards.map((b) => (
                <Link
                  key={b.id}
                  href={`/b/${b.id}`}
                  className="rounded-lg border border-swan bg-[var(--track)] px-2.5 py-1 text-xs text-beetle-dark hover:border-beetle hover:underline dark:border-[#37464f] dark:text-beetle"
                  title="前往看板查看卡片"
                >
                  📋 {b.name}
                  {b.visibility === "private" && (
                    <span className="ml-1 text-[10px] text-hare">(私人)</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 左右分栏布局：左侧消息流与发送区，右侧交接与权限控制 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左侧：消息流 (占 2 栏) */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <ChannelChatView
            key={channelId}
            channelId={channelId}
            channelType={channel.type}
            initialMessages={initialMessages}
            cardTitles={cardTitles}
            availableCards={availableCards}
          />
        </div>

        {/* 右侧：交接与创建者管理 (占 1 栏) */}
        <div className="min-w-0 space-y-4 lg:col-span-1">
          {/* 任务交接区域 */}
          <HandoffSection
            key={channelId}
            channelId={channelId}
            handoffs={handoffs}
            grantedAgents={grantedAgents}
            cardTitles={cardTitles}
            availableCards={availableCards}
          />

          {/* Agent 权限管理（成员可授权自己的 Agent，创建者可移除所有已授权 Agent） */}
          <AgentGrantManager
            channelId={channelId}
            eligibleAgents={eligibleAgents}
            isCreator={isCreator}
          />
        </div>
      </div>
    </div>
  );
}
