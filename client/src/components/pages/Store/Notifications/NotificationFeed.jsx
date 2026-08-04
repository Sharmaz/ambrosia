"use client";

import { DeleteButton } from "@/components/shared/DeleteButton";
import { MarkReadButton } from "@/components/shared/MarkReadButton";

import { formatTimestamp } from "./utils/formatTimestamp";
import { getAdminNotificationDisplay } from "./utils/notificationDisplay";

function NotificationStatus({ isUnread, notificationsTranslations }) {
  return (
    <span className={isUnread ? "font-semibold text-green-800" : "font-medium text-gray-500"}>
      {notificationsTranslations(isUnread ? "statuses.unread" : "statuses.read")}
    </span>
  );
}

function NotificationMeta({ notification, notificationDisplay, notificationsTranslations }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      <span>
        {notificationsTranslations("fields.actor")}
        {": "}
        <span className="font-medium text-gray-700">{notificationDisplay.actorLabel}</span>
      </span>
      <span>
        {notificationsTranslations("fields.role")}
        {": "}
        <span className="font-medium text-gray-700">{notificationDisplay.roleLabel}</span>
      </span>
      <span>
        {notificationsTranslations("fields.occurredAt")}
        {": "}
        <span className="font-medium text-gray-700">
          {formatTimestamp(notification.occurredAt || notification.createdAt)}
        </span>
      </span>
    </div>
  );
}

function NotificationMarkReadButton({ notification, onMarkRead, notificationsTranslations }) {
  if (notification.readAt) return null;

  return (
    <MarkReadButton
      onPress={() => onMarkRead(notification.id)}
      aria-label={notificationsTranslations("actions.markRead")}
    >
      {notificationsTranslations("actions.markRead")}
    </MarkReadButton>
  );
}

function DeleteNotificationButton({ notification, onDeleteNotification, notificationsTranslations }) {
  return (
    <DeleteButton
      onPress={() => onDeleteNotification(notification.id)}
      aria-label={notificationsTranslations("actions.delete")}
    >
      {notificationsTranslations("actions.delete")}
    </DeleteButton>
  );
}

function NotificationActions({
  notification,
  onDeleteNotification,
  onMarkRead,
  notificationsTranslations,
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <NotificationMarkReadButton
        notification={notification}
        onMarkRead={onMarkRead}
        notificationsTranslations={notificationsTranslations}
      />
      <DeleteNotificationButton
        notification={notification}
        onDeleteNotification={onDeleteNotification}
        notificationsTranslations={notificationsTranslations}
      />
    </div>
  );
}

function NotificationMobileCard({
  notification,
  onDeleteNotification,
  onMarkRead,
  notificationsTranslations,
}) {
  const isUnread = !notification.readAt;
  const notificationDisplay = getAdminNotificationDisplay(notification, notificationsTranslations);

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <NotificationStatus isUnread={isUnread} notificationsTranslations={notificationsTranslations} />
            <span className="text-gray-400">/</span>
            <span className="font-medium text-gray-600">{notificationDisplay.categoryLabel}</span>
            {notificationDisplay.amountLabel && (
              <>
                <span className="text-gray-400">/</span>
                <span className="font-medium text-green-800">{notificationDisplay.amountLabel}</span>
              </>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold text-green-900">{notificationDisplay.title}</h3>
          <p className="mt-1 text-sm text-gray-600">{notificationDisplay.description}</p>
        </div>
      </div>

      <NotificationMeta
        notification={notification}
        notificationDisplay={notificationDisplay}
        notificationsTranslations={notificationsTranslations}
      />

      <div className="mt-4">
        <NotificationActions
          notification={notification}
          onDeleteNotification={onDeleteNotification}
          onMarkRead={onMarkRead}
          notificationsTranslations={notificationsTranslations}
        />
      </div>
    </article>
  );
}

function NotificationTableRow({
  notification,
  onDeleteNotification,
  onMarkRead,
  notificationsTranslations,
}) {
  const isUnread = !notification.readAt;
  const notificationDisplay = getAdminNotificationDisplay(notification, notificationsTranslations);

  return (
    <tr className={isUnread ? "bg-green-50/70" : "bg-white"}>
      <td className="px-4 py-4 align-top">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <NotificationStatus isUnread={isUnread} notificationsTranslations={notificationsTranslations} />
            <span className="text-gray-400">/</span>
            <span className="font-medium text-gray-600">{notificationDisplay.categoryLabel}</span>
            {notificationDisplay.statusLabel && (
              <>
                <span className="text-gray-400">/</span>
                <span className="text-gray-600">{notificationDisplay.statusLabel}</span>
              </>
            )}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-green-900">{notificationDisplay.title}</h3>
          <p className="mt-1 max-w-xl text-sm text-gray-600">{notificationDisplay.description}</p>
        </div>
      </td>
      <td className="px-4 py-4 align-top text-sm text-gray-700">
        <div className="max-w-44 truncate font-medium">{notificationDisplay.actorLabel}</div>
        <div className="mt-1 text-xs text-gray-500">{notificationDisplay.roleLabel}</div>
      </td>
      <td className="px-4 py-4 align-top text-sm text-gray-700">
        {notificationDisplay.amountLabel || "---"}
      </td>
      <td className="px-4 py-4 align-top text-sm text-gray-700">
        {formatTimestamp(notification.occurredAt || notification.createdAt)}
      </td>
      <td className="px-4 py-4 align-top text-right">
        <NotificationActions
          notification={notification}
          onDeleteNotification={onDeleteNotification}
          onMarkRead={onMarkRead}
          notificationsTranslations={notificationsTranslations}
        />
      </td>
    </tr>
  );
}

function NotificationsTable({
  notifications,
  onDeleteNotification,
  onMarkRead,
  notificationsTranslations,
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] border-separate border-spacing-0">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase text-gray-500">
            <th className="border-b border-gray-200 px-4 py-3">{notificationsTranslations("table.notification")}</th>
            <th className="border-b border-gray-200 px-4 py-3">{notificationsTranslations("fields.actor")}</th>
            <th className="border-b border-gray-200 px-4 py-3">{notificationsTranslations("table.amount")}</th>
            <th className="border-b border-gray-200 px-4 py-3">{notificationsTranslations("fields.occurredAt")}</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right">{notificationsTranslations("table.action")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {notifications.map((notification) => (
            <NotificationTableRow
              key={notification.id}
              notification={notification}
              onDeleteNotification={onDeleteNotification}
              onMarkRead={onMarkRead}
              notificationsTranslations={notificationsTranslations}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotificationsMobileList({
  notifications,
  onDeleteNotification,
  onMarkRead,
  notificationsTranslations,
}) {
  return (
    <div className="space-y-3 md:hidden">
      {notifications.map((notification) => (
        <NotificationMobileCard
          key={notification.id}
          notification={notification}
          onDeleteNotification={onDeleteNotification}
          onMarkRead={onMarkRead}
          notificationsTranslations={notificationsTranslations}
        />
      ))}
    </div>
  );
}

export function NotificationFeed({
  notifications,
  loading,
  error,
  onDeleteNotification,
  onMarkRead,
  notificationsTranslations,
}) {
  if (error) {
    return <p className="text-sm text-red-600">{notificationsTranslations("statuses.error")}</p>;
  }

  if (loading) {
    return <p className="text-sm text-gray-600">{notificationsTranslations("statuses.loading")}</p>;
  }

  if (notifications.length === 0) {
    return (
      <div className="py-10 text-center">
        <h2 className="text-lg font-semibold text-green-900">{notificationsTranslations("empty.title")}</h2>
        <p className="mt-1 text-sm text-gray-500">{notificationsTranslations("empty.description")}</p>
      </div>
    );
  }

  return (
    <>
      <NotificationsMobileList
        notifications={notifications}
        onDeleteNotification={onDeleteNotification}
        onMarkRead={onMarkRead}
        notificationsTranslations={notificationsTranslations}
      />
      <NotificationsTable
        notifications={notifications}
        onDeleteNotification={onDeleteNotification}
        onMarkRead={onMarkRead}
        notificationsTranslations={notificationsTranslations}
      />
    </>
  );
}
