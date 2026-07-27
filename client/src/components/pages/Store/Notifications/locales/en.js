const notificationsEn = {
  notifications: {
    title: "Admin notifications",
    subtitle: "Review important activity across wallet and admin workflows.",
    live: "Live",
    offline: "Reconnecting",
    filters: {
      wallet: "Wallet",
      all: "All",
      unreadOnly: "Unread only",
    },
    actions: {
      markAllRead: "Mark all read",
      markRead: "Mark read",
      refresh: "Refresh",
      testPush: "Test",
    },
    preferences: {
      title: "Preferences",
      inApp: "In-app",
      push: "Web Push",
      wallet: "Wallet activity",
    },
    empty: {
      title: "No notifications",
      description: "Important admin activity will appear here.",
    },
    fields: {
      actor: "Actor",
      role: "Role",
      status: "Status",
      category: "Category",
      occurredAt: "Occurred",
    },
    statuses: {
      unread: "Unread",
      read: "Read",
      error: "Could not load admin notifications.",
    },
    webPush: {
      active: "Browser push enabled on this device",
      denied: "Browser permission denied",
      endpoint: "Endpoint",
      permissionRequired: "Browser permission required",
      saving: "Updating browser push",
      unsupported: "Browser push is not supported here",
    },
  },
};

export default notificationsEn;
