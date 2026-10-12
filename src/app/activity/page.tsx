import Link from "next/link";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import { Empty } from "@/components/Section";
import { getSessionUser } from "@/lib/current-user";
import { relTime } from "@/lib/dates";
import { describeEvent, EVENT_ICON } from "@/lib/events";
import { feed, getAllUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const items = feed(user.id);
  const names = new Map(getAllUsers().map((u) => [u.id, u.displayName]));

  return (
    <div className="mx-auto max-w-3xl lg:max-w-6xl">
      <h2 className="text-lg font-black">动态</h2>
      <p className="mt-0.5 mb-3 text-[11px] font-bold text-hare">
        全组板上发生的事。私人板不出现在这里，包括你自己的。
      </p>

      {items.length === 0 ? (
        <Empty>还没有动静。</Empty>
      ) : (
        <div className="duo-card divide-y-2 divide-swan dark:divide-[#37464f]">
          {items.map((e) => (
            <Link key={e.id} href={`/c/${e.cardId}`} className="flex items-start gap-2.5 px-3.5 py-2.5">
              <Avatar userId={e.userId} size="lg" className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold">
                  <span className="font-black">{names.get(e.userId) ?? e.userId}</span>{" "}
                  {describeEvent(e)}
                </span>
                <span className="mt-0.5 block truncate text-[12px] font-bold">
                  {EVENT_ICON[e.type]} {e.cardTitle}
                </span>
                <span className="text-[10px] font-bold text-hare">
                  {e.boardName} · {relTime(e.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
