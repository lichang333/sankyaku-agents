import Link from "next/link";
import { redirect } from "next/navigation";
import BoardSettingsForm from "@/components/BoardSettingsForm";
import LabelManager from "@/components/LabelManager";
import RestoreListButton from "@/components/RestoreListButton";
import { requireBoard } from "@/lib/current-user";
import { getLabels, getLists } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BoardSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) redirect("/");
  const { user, board } = await requireBoard(boardId);

  const canEdit = board.createdBy === user.id || user.isAdmin;
  const archivedLists = getLists(boardId, true).filter((l) => l.archivedAt);

  const box = "duo-card p-3.5";
  const h = "mb-2.5 text-[14px] font-black";

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link href={`/b/${boardId}`} className="text-xs font-bold text-hare">
        ← {board.name}
      </Link>

      <section className={box}>
        <h2 className={h}>板设置</h2>
        {!canEdit && (
          <p className="mb-2 text-[11px] font-bold text-hare">
            这块板是 {board.createdBy} 建的，设置只有他和管理员能改。
          </p>
        )}
        <BoardSettingsForm board={board} canEdit={canEdit} canDelete={user.isAdmin} />
      </section>

      <section className={box}>
        <h2 className={h}>标签</h2>
        <LabelManager boardId={boardId} labels={getLabels(boardId)} />
      </section>

      {archivedLists.length > 0 && (
        <section className={box}>
          <h2 className={h}>归档的列</h2>
          <div className="space-y-1.5">
            {archivedLists.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{l.name}</span>
                <RestoreListButton listId={l.id} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
