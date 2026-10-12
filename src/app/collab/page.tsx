import { redirect } from "next/navigation";
import ChannelList from "@/components/collab/ChannelList";
import CreateChannelForm from "@/components/collab/CreateChannelForm";
import Section from "@/components/Section";
import { listChannels } from "@/lib/collaboration";
import { getSessionUser } from "@/lib/current-user";
import { listBoards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CollabHubPage({
  searchParams,
}: {
  searchParams?: Promise<{ board?: string; boardId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const resolvedParams = searchParams ? await searchParams : {};
  const filterParam = resolvedParams.board || resolvedParams.boardId;
  const filteredBoardId = filterParam ? Number(filterParam) : undefined;

  // 获取当前用户有权访问的所有频道
  const allChannels = listChannels({ kind: "human", id: user.id });

  // 获取当前用户能看见的非归档项目看板
  const visibleBoards = listBoards(user.id);
  const boardMap = Object.fromEntries(
    visibleBoards.map((b) => [b.id, { id: b.id, name: b.name, visibility: b.visibility }]),
  );

  // 筛选频道（如果指定了看板）
  const displayChannels =
    filteredBoardId && Number.isSafeInteger(filteredBoardId)
      ? allChannels.filter((c) => c.boardIds.includes(filteredBoardId))
      : allChannels;

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-6xl">
      {/* 头部与说明 */}
      <div className="duo-card p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">💬</span>
            <h2 className="text-lg font-black tracking-wide">协作空间</h2>
          </div>
          <p className="text-xs font-bold text-hare">
            人与 AI Agent 的结构化沟通环境。支持围绕具体项目、通用议题以及跨项目桥梁开展对话与任务交接。
          </p>

          {/* 三种频道类型说明 */}
          <div className="mt-3 grid gap-2.5 pt-2 sm:grid-cols-3">
            <div className="rounded-xl border-2 border-swan bg-[var(--track)] p-3 dark:border-[#37464f]">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-macaw/20 px-1.5 py-0.5 text-[10px] font-black text-macaw-dark dark:text-macaw">
                  项目协作
                </span>
                <span className="text-[11px] font-extrabold text-mid">Project</span>
              </div>
              <p className="mt-1.5 text-[11px] font-bold text-hare">
                严格关联 1 个项目看板，支持直接引用板上任务卡片，聚焦单个项目推进。
              </p>
            </div>

            <div className="rounded-xl border-2 border-swan bg-[var(--track)] p-3 dark:border-[#37464f]">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-bee/20 px-1.5 py-0.5 text-[10px] font-black text-bee-dark dark:text-bee">
                  议题讨论
                </span>
                <span className="text-[11px] font-extrabold text-mid">Topic</span>
              </div>
              <p className="mt-1.5 text-[11px] font-bold text-hare">
                无项目看板绑定，对团队全体成员开放，适合头脑风暴与通用话题探讨。
              </p>
            </div>

            <div className="rounded-xl border-2 border-swan bg-[var(--track)] p-3 dark:border-[#37464f]">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-beetle/20 px-1.5 py-0.5 text-[10px] font-black text-beetle-dark dark:text-beetle">
                  跨项目协同
                </span>
                <span className="text-[11px] font-extrabold text-mid">Bridge</span>
              </div>
              <p className="mt-1.5 text-[11px] font-bold text-hare">
                关联 2 至 10 个项目看板。人类需能查看全部关联看板；Agent 需另行获得频道授权。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 频道列表 */}
      <Section title="已授权频道" hint={`${displayChannels.length} 个频道`}>
        <ChannelList
          channels={displayChannels}
          boardMap={boardMap}
          filteredBoardId={filteredBoardId}
        />
        <CreateChannelForm
          boards={visibleBoards.map((b) => ({
            id: b.id,
            name: b.name,
            visibility: b.visibility,
          }))}
        />
      </Section>
    </div>
  );
}
