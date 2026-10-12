import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";

describe("密码哈希", () => {
  it("正确密码通过、错误密码拒绝", () => {
    const h = hashPassword("tori-2027");
    expect(verifyPassword("tori-2027", h)).toBe(true);
    expect(verifyPassword("tori-2028", h)).toBe(false);
  });

  it("同一密码两次哈希不同（随机盐）", () => {
    expect(hashPassword("a")).not.toBe(hashPassword("a"));
  });

  it("损坏的存储值不通过", () => {
    expect(verifyPassword("a", "not-a-hash")).toBe(false);
    expect(verifyPassword("a", "")).toBe(false);
  });
});

describe("会话 token", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("没有独立密钥时无法签发或接受会话", () => {
    const token = createSessionToken("admin");
    for (const secret of [undefined, "", "kanban-dev-secret"]) {
      vi.stubEnv("KANBAN_SECRET", secret);
      expect(() => createSessionToken("admin")).toThrow("KANBAN_SECRET");
      expect(verifySessionToken(token)).toBeNull();
    }
  });

  it("签发后可验证出 uid", () => {
    expect(verifySessionToken(createSessionToken("admin"))).toBe("admin");
  });

  it("篡改后拒绝", () => {
    const t = createSessionToken("admin");
    expect(verifySessionToken(t.replace("admin", "someone"))).toBeNull();
    expect(verifySessionToken(t + "x")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });

  it("过期拒绝", () => {
    expect(verifySessionToken(createSessionToken("admin", -1))).toBeNull();
  });
});
