import Link from "next/link";
import { redirect } from "next/navigation";
import Board from "@/components/Board";
import { requireBoard } from "@/lib/current-user";
import { todayISO } from "@/lib/dates";
import { getAllUsers, getBoardView } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) redirect("/");
  const { user, board } = await requireBoard(boardId);

  const view = getBoardView(boardId);
  if (!view) redirect("/");

  return (
    // 抵消 <main> 的底部留白：板自己已经算好占满一屏，
    // 再留 8rem 就会多出一段谁都不需要的整页滚动
    <div className="-mb-32 md:-mb-16">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-lg font-black">{board.name}</h2>
        {board.visibility === "private" && (
          <span className="shrink-0 rounded-md bg-[var(--track)] px-1.5 py-0.5 text-[10px] font-bold text-mid">
            私人
          </span>
        )}
        <Link
          href={`/collab?board=${boardId}`}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-beetle-dark hover:bg-beetle/10 dark:text-beetle"
          title="查看此项目看板的协作频道"
        >
          💬 协作空间
        </Link>
        <Link
          href={`/b/${boardId}/archive`}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-hare"
        >
          🗄 归档
        </Link>
        <Link
          href={`/b/${boardId}/settings`}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-hare"
        >
          ⚙️ 设置
        </Link>
      </div>
      {board.description && (
        <p className="mt-0.5 text-[11px] font-bold text-hare">{board.description}</p>
      )}

      <Board board={view} users={getAllUsers()} today={todayISO()} />

      <p className="mt-1 text-[11px] font-bold text-hare md:hidden">
        按住卡片一下再拖。想跨好几列挪，进卡片里用「移动到」更快。
      </p>
    </div>
  );
}
