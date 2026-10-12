"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * 点外面或按 Escape 就关掉的菜单行为。
 * 用户菜单、负责人下拉、列头菜单三处原来各抄一份 mousedown 监听，
 * 谁补了 Escape 谁没补全看运气——收口到这里，三个菜单永远一个脾气。
 * onClose 走 ref 转一道：调用方传内联箭头函数也不会让监听器反复重挂。
 */
export function useOutsideClose(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb.current();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [ref]);
}
