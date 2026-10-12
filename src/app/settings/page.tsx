import { redirect } from "next/navigation";
import AvatarPicker from "@/components/AvatarPicker";
import InviteButton from "@/components/InviteButton";
import PasswordForm from "@/components/PasswordForm";
import PushToggle from "@/components/PushToggle";
import { getSessionUser } from "@/lib/current-user";
import { getAllUsers, getAvatarMap } from "@/lib/queries";
import { DEFAULT_AVATAR } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const avatars = getAvatarMap();
  const names = new Map(getAllUsers().map((u) => [u.id, u.displayName]));
  // 头像一人一款：算出每个 key 被谁占了（自己占的不算）
  const takenBy: Record<string, string> = {};
  for (const [uid, key] of Object.entries(avatars)) {
    if (uid === user.id) continue;
    takenBy[key] = names.get(uid) ?? uid;
  }
  const mine = avatars[user.id] ?? DEFAULT_AVATAR[user.id] ?? "plain";

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-6xl">
      <Card title="头像">
        <AvatarPicker current={mine} takenBy={takenBy} />
      </Card>

      <Card title="邀请伙伴">
        <InviteButton />
      </Card>

      <Card title="推送通知">
        <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      </Card>

      <Card title="改密码">
        <PasswordForm />
      </Card>

      <p className="pt-2 text-center text-[11px] font-bold text-hare">
        登录为 {user.displayName}（@{user.id}）{user.isAdmin && " · 管理员"}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="duo-card p-3.5">
      <h2 className="mb-2.5 text-[14px] font-black">{title}</h2>
      {children}
    </section>
  );
}
