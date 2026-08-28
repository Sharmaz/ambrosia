const importDataEs = {
  cardImportData: {
    title: "Importar datos",
    description: "Restaura los datos de tu negocio desde un archivo de respaldo exportado de otra instalación de Ambrosia. Esto sobrescribe todos los datos actuales.",
    importButton: "Importar datos",
    modalTitle: "Confirmar acceso",
    passwordLabel: "Contraseña de wallet",
    cancelButton: "Cancelar",
    confirmButton: "Confirmar",
    missingFields: "Ingresa la contraseña del respaldo y selecciona un archivo para continuar.",
    continueButton: "Continuar",
    importing: "Importando tu respaldo...",
    uploadingProgress: "Subiendo... {percent}%",
    processing: "Procesando tu respaldo...",
    success: "Respaldo importado con éxito.",
    errorDescription: "No se pudo importar el respaldo. Verifica el archivo e intenta de nuevo.",
    restartRequiredElectron: "Reiniciando la aplicación...",
    restartRequiredManual: "Por favor reinicia el servidor de Ambrosia para terminar de cargar tus datos.",
    confirmModal: {
      title: "¿Sobrescribir todos los datos del negocio?",
      description: "Esto reemplaza cada producto, orden, usuario y configuración con el contenido del archivo de respaldo.",
      warning: "Esta acción no se puede deshacer a menos que tengas otro respaldo de los datos actuales.",
      cancelButton: "Cancelar",
      confirmButton: "Sobrescribir e importar",
    },
  },
};

export default importDataEs;
