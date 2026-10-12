import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/current-user";
import { deletePushSub, savePushSub } from "@/lib/queries";

/** 订阅推送（浏览器给的 endpoint + 两把密钥） */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const sub = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth)
    return NextResponse.json({ error: "订阅信息不全" }, { status: 400 });

  savePushSub({
    endpoint: sub.endpoint,
    user_id: user.id,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  });
  return NextResponse.json({ ok: true });
}

/** 退订这台设备 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (endpoint) deletePushSub(endpoint);
  return NextResponse.json({ ok: true });
}
