/** 用法：npx tsx scripts/set-password.ts <用户id> <新密码> */
import { hashPassword } from "../src/lib/auth";
import { db } from "../src/lib/db";

const [uid, password] = process.argv.slice(2);
if (!uid || !password) {
  console.error("用法：npx tsx scripts/set-password.ts <用户id> <新密码>");
  process.exit(1);
}
const res = db()
  .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
  .run(hashPassword(password), uid);
if (res.changes === 0) {
  console.error(`用户 ${uid} 不存在`);
  process.exit(1);
}
console.log(`已更新 ${uid} 的密码`);
