const importDataEn = {
  cardImportData: {
    title: "Import data",
    description: "Restore your business data from a backup file exported from another Ambrosia installation. This overwrites all current data.",
    importButton: "Import data",
    modalTitle: "Confirm access",
    passwordLabel: "Wallet password",
    cancelButton: "Cancel",
    confirmButton: "Confirm",
    fileLabel: "Backup file",
    fileHint: "Select the .zip file you exported from Settings.",
    missingFields: "Select a backup file to continue.",
    continueButton: "Continue",
    importing: "Importing your backup...",
    success: "Backup imported successfully.",
    errorDescription: "Could not import the backup. Check the file and try again.",
    restartRequiredElectron: "Restarting the app now...",
    restartRequiredManual: "Please restart the Ambrosia server to finish loading your data.",
    confirmModal: {
      title: "Overwrite all business data?",
      description: "This replaces every product, order, user, and setting with the contents of the backup file.",
      warning: "This action cannot be undone unless you have another backup of the current data.",
      cancelButton: "Cancel",
      confirmButton: "Overwrite and import",
    },
  },
};

export default importDataEn;
