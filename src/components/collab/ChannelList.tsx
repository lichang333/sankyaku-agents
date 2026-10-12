import Link from "next/link";
import type { ChannelPublic } from "@/lib/collaboration";

interface BoardInfo {
  id: number;
  name: string;
}

export default function ChannelList({
  channels,
  boardMap,
  filteredBoardId,
}: {
  channels: ChannelPublic[];
  boardMap: Record<number, BoardInfo>;
  filteredBoardId?: number;
}) {
  const filteredBoard = filteredBoardId ? boardMap[filteredBoardId] : undefined;

  return (
    <div className="space-y-3">
      {filteredBoard && (
        <div className="flex items-center justify-between rounded-xl border-2 border-beetle/30 bg-beetle/10 px-3.5 py-2 text-xs font-bold text-beetle-dark dark:text-beetle">
          <div className="flex items-center gap-2">
            <span>🔍 筛选看板:</span>
            <span className="font-extrabold">{filteredBoard.name}</span>
          </div>
          <Link
            href="/collab"
            className="rounded-lg bg-[var(--card)] px-2 py-1 text-[11px] font-bold text-mid hover:text-cardinal"
          >
            清除筛选
          </Link>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="duo-card p-6 text-center">
          <div className="text-3xl">💬</div>
          <h4 className="mt-2 text-sm font-black">
            {filteredBoard ? "该项目看板下暂无协作频道" : "暂无协作频道"}
          </h4>
          <p className="mt-1 text-xs font-bold text-hare">
            {filteredBoard
              ? "您可以清除筛选查看其他频道，或为该看板创建新的项目协作频道。"
              : "点击下方「创建协作频道」，选择项目协作、议题讨论或跨项目协同，开启人机协同。"}
          </p>
          {filteredBoard && (
            <div className="mt-3">
              <Link
                href="/collab"
                className="inline-block rounded-xl border-2 border-swan px-3 py-1.5 text-xs font-bold text-mid hover:border-beetle hover:text-beetle-dark dark:border-[#37464f]"
              >
                查看全部频道
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => {
            const isProject = ch.type === "project";
            const isTopic = ch.type === "topic";
            const isBridge = ch.type === "bridge";

            const badgeBg = isProject
              ? "bg-macaw/15 text-macaw-dark dark:text-macaw"
              : isTopic
                ? "bg-bee/15 text-bee-dark dark:text-bee"
                : "bg-beetle/15 text-beetle-dark dark:text-beetle";

            const typeLabel = isProject ? "项目协作" : isTopic ? "议题讨论" : "跨项目";

            return (
              <Link
                key={ch.id}
                href={`/collab/${ch.id}`}
                className="duo-card block p-3.5 transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${badgeBg}`}>
                    {typeLabel}
                  </span>
                  <span className="text-[10px] font-bold text-hare">#{ch.id}</span>
                </div>

                <h3 className="mt-2 truncate text-sm font-black">{ch.name}</h3>

                {ch.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs font-bold text-hare">{ch.summary}</p>
                ) : (
                  <p className="mt-1 text-xs font-bold text-hare/60 italic">无描述摘要</p>
                )}

                {/* 关联项目看板 */}
                {ch.boardIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-swan pt-2 text-[11px] font-bold text-hare dark:border-[#37464f]">
                    <span className="shrink-0 text-mid">看板:</span>
                    {ch.boardIds.map((bid) => {
                      const b = boardMap[bid];
                      return (
                        <span
                          key={bid}
                          className="rounded bg-[var(--track)] px-1.5 py-0.5 text-[10px] text-mid"
                        >
                          {b ? b.name : `看板 #${bid}`}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
