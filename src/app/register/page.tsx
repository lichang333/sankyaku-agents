import { redirect } from "next/navigation";
import Mascot from "@/components/Mascot";
import RegisterForm from "@/components/RegisterForm";
import { getSessionUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { code } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-10">
      <Mascot className="h-28 w-28" variant="pencil" />
      <h2 className="mt-3 text-2xl font-black tracking-wide">三脚看板</h2>
      <p className="mt-1 mb-6 text-sm font-bold text-hare">凭邀请码加入 · 进门就能看到所有全组板</p>
      <div className="w-full">
        <RegisterForm code={code ?? ""} />
      </div>
    </div>
  );
}
