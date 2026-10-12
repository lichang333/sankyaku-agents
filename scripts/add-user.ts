/**
 * 直接建一个成员并设初始密码（正常途径是设置页发邀请链接，
 * 这个脚本用于代建：npx tsx scripts/add-user.ts <uid> "<显示名>" [密码]）
 * 不传密码时随机生成一个并打印出来。
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth";
import { db } from "../src/lib/db";

const [uid, displayName, given] = process.argv.slice(2);
if (!uid || !displayName) {
  console.error('用法：npx tsx scripts/add-user.ts <uid> "<显示名>" [密码]');
  process.exit(1);
}
if (!/^[a-z0-9_]{2,24}$/.test(uid)) {
  console.error("uid 只能用小写字母、数字、下划线（2–24 位）");
  process.exit(1);
}

const password =
  given ?? Array.from({ length: 2 }, () => randomBytes(3).toString("hex")).join("-");

const d = db();
const exists = d.prepare("SELECT 1 FROM users WHERE id = ?").get(uid);
if (exists) {
  d.prepare("UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?").run(
    displayName,
    hashPassword(password),
    uid
  );
  console.log(`已更新 ${uid}（${displayName}）的密码`);
} else {
  d.prepare(
    "INSERT INTO users (id, display_name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)"
  ).run(uid, displayName, hashPassword(password), new Date().toISOString());
  console.log(`已创建 ${uid}（${displayName}）`);
}
console.log(`初始密码：${password}`);
console.log("登录后请到 设置 → 改密码 换成自己的");
