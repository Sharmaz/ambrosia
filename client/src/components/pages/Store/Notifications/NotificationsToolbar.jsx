"use client";

import { Button, Switch, Tab, Tabs } from "@heroui/react";

import { ADMIN_NOTIFICATION_CATEGORY_WALLET } from "@/lib/adminNotifications";

export function NotificationsToolbar({
  filters,
  liveConnected,
  unreadCount,
  onFiltersChange,
  onMarkAllRead,
  onRefresh,
  notificationsTranslations,
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-2">
        <Tabs
          selectedKey={filters.category || "all"}
          onSelectionChange={(selectedCategory) => (
            onFiltersChange({ category: selectedCategory === "all" ? null : selectedCategory })
          )}
          aria-label={notificationsTranslations("title")}
          variant="underlined"
          classNames={{
            tabList: "gap-4 rounded-none p-0",
            cursor: "bg-forest",
            tab: "h-10 px-0",
            tabContent: "group-data-[selected=true]:text-forest text-gray-500 text-sm font-medium",
          }}
        >
          <Tab key={ADMIN_NOTIFICATION_CATEGORY_WALLET} title={notificationsTranslations("filters.wallet")} />
          <Tab key="all" title={notificationsTranslations("filters.all")} />
        </Tabs>
        <span className={liveConnected ? "text-xs text-green-700" : "text-xs text-amber-600"}>
          {notificationsTranslations(liveConnected ? "live" : "offline")}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Switch
          size="sm"
          isSelected={filters.unreadOnly}
          onValueChange={(unreadOnly) => onFiltersChange({ unreadOnly })}
        >
          <span className="text-sm font-medium">{notificationsTranslations("filters.unreadOnly")}</span>
        </Switch>
        <Button
          variant="bordered"
          className="h-8 min-w-16 px-3 rounded-small border-green-800 text-green-800 sm:h-10 sm:min-w-20 sm:px-4 sm:rounded-medium"
          onPress={() => onRefresh()}
        >
          {notificationsTranslations("actions.refresh")}
        </Button>
        <Button
          color="primary"
          className="h-8 min-w-16 px-3 rounded-small bg-green-800 sm:h-10 sm:min-w-20 sm:px-4 sm:rounded-medium"
          isDisabled={unreadCount === 0}
          onPress={onMarkAllRead}
        >
          {notificationsTranslations("actions.markAllRead")}
        </Button>
      </div>
    </div>
  );
}
