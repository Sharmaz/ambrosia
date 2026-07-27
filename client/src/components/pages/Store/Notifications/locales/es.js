const notificationsEs = {
  notifications: {
    title: "Notificaciones admin",
    subtitle: "Revisa actividad importante de Wallet y flujos administrativos.",
    live: "En vivo",
    offline: "Reconectando",
    filters: {
      wallet: "Wallet",
      all: "Todas",
      unreadOnly: "Solo no leidas",
    },
    actions: {
      markAllRead: "Marcar todas",
      markRead: "Marcar leida",
      refresh: "Actualizar",
      testPush: "Probar",
    },
    preferences: {
      title: "Preferencias",
      inApp: "En app",
      push: "Web Push",
      wallet: "Actividad Wallet",
    },
    empty: {
      title: "Sin notificaciones",
      description: "La actividad administrativa importante aparecera aqui.",
    },
    fields: {
      actor: "Actor",
      role: "Rol",
      status: "Estado",
      category: "Categoria",
      occurredAt: "Ocurrio",
    },
    statuses: {
      unread: "No leida",
      read: "Leida",
      error: "No se pudieron cargar las notificaciones admin.",
    },
    webPush: {
      active: "Push del navegador activo en este dispositivo",
      denied: "Permiso del navegador denegado",
      endpoint: "Endpoint",
      permissionRequired: "Requiere permiso del navegador",
      saving: "Actualizando push del navegador",
      unsupported: "Push del navegador no esta soportado aqui",
    },
  },
};

export default notificationsEs;
