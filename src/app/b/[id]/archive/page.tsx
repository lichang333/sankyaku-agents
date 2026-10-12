import Link from "next/link";
import { redirect } from "next/navigation";
import RestoreCardButton from "@/components/RestoreCardButton";
import { Empty } from "@/components/Section";
import { requireBoard } from "@/lib/current-user";
import { relTime } from "@/lib/dates";
import { archivedCards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) redirect("/");
  const { board } = await requireBoard(boardId);
  const cards = archivedCards(boardId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href={`/b/${boardId}`} className="text-xs font-bold text-hare">
          ← {board.name}
        </Link>
      </div>
      <h2 className="mt-1 text-lg font-black">归档的卡</h2>
      <p className="mt-0.5 mb-3 text-[11px] font-bold text-hare">
        归档不是删除。卡还在这儿，连同它的评论和履历——「当时为什么放弃」有时比做完的那些更值钱。
      </p>

      {cards.length === 0 ? (
        <Empty>还没归档过东西。</Empty>
      ) : (
        <div className="duo-card divide-y-2 divide-swan dark:divide-[#37464f]">
          {cards.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3.5 py-2.5">
              <Link href={`/c/${c.id}`} className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{c.title}</p>
                <p className="text-[10px] font-bold text-hare">
                  {c.archivedAt && relTime(c.archivedAt)}归档
                </p>
              </Link>
              <RestoreCardButton cardId={c.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
