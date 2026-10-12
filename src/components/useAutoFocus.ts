"use client";

import { useCallback } from "react";

/**
 * 代替 autoFocus 属性用的 ref。
 *
 * autoFocus 会让浏览器把刚获得焦点的元素「滚动到可见区域」。
 * 在普通页面上这没什么，但看板是一个横向滚动容器：
 * 点最右那列的列名改个名字，整块板会往右滑一截、把最左边那列切掉——
 * 用户没要求任何滚动，屏幕却动了，而且动的是他正在看的东西。
 *
 * focus({ preventScroll: true }) 只给焦点，不碰任何祖先容器的滚动位置。
 * 反正这些输入框都是用户刚点出来的，本来就在眼前，不需要谁再帮忙滚一次。
 */
export function useAutoFocus<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    el?.focus({ preventScroll: true });
  }, []);
}
