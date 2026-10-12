import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import Mascot from "@/components/Mascot";
import { getSessionUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-10">
      <Mascot className="h-28 w-28" variant="note" />
      <h2 className="mt-3 text-2xl font-black tracking-wide">三脚协作 · Sankyaku Agents</h2>
      <p className="mt-1 mb-6 text-sm font-bold text-hare">人与 AI Agent 协同：项目协作、议题讨论与跨项目沟通</p>
      <div className="w-full">
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-[11px] font-bold text-hare">
        这是个小组内部的工作空间，凭邀请链接加入
      </p>
    </div>
  );
}
