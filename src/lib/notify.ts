/* ── 网页推送 ──
 * 没配 VAPID 密钥时整个模块静默失效：本地开发不该因为少个环境变量就报错。
 * 生成密钥：npx web-push generate-vapid-keys
 */
import webpush from "web-push";
import { deletePushSub, pushSubsFor } from "./queries";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "";

export const pushEnabled = !!(PUBLIC && PRIVATE && SUBJECT);
if (pushEnabled) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** 给一批用户推一条。订阅失效（410/404）就地清掉，免得越攒越多。 */
export async function pushTo(userIds: string[], payload: PushPayload) {
  if (!pushEnabled || !userIds.length) return;
  const subs = pushSubsFor([...new Set(userIds)]);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) deletePushSub(s.endpoint);
      }
    })
  );
}
