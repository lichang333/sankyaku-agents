/**
 * 推送用的 service worker。只做两件事：把推送弹成通知、点通知跳转。
 * 不做离线缓存——那会让「部署完刷新看不到新版本」这类问题变得难查。
 */
self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return { body: event.data ? event.data.text() : "" };
    }
  })();

  event.waitUntil(
    self.registration.showNotification(data.title ?? "三脚看板", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag ?? "kanban",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // 已经开着就聚焦过去，别开第二个标签页
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
