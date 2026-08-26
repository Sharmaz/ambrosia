"use client";

import { useState } from "react";

import { Button, Card, CardBody, CardHeader, Spinner } from "@heroui/react";

import WalletGuard from "@components/auth/WalletGuard";

import { ImportBackupConfirmModal } from "./ImportBackupConfirmModal";

export function ImportDataCardUnlocked({ onImport, onHide, importDataTranslations }) {
  const [password, setPassword] = useState(null);
  const [backupFile, setBackupFile] = useState(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleFileChange = (event) => {
    setBackupFile(event.target.files?.[0] ?? null);
    setErrorMessage("");
  };

  const handleContinue = () => {
    if (!backupFile) {
      setErrorMessage(importDataTranslations("cardImportData.missingFields"));
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleConfirmImport = async () => {
    setIsConfirmModalOpen(false);
    setIsImporting(true);
    setErrorMessage("");
    try {
      await onImport(password, backupFile);
    } catch {
      setErrorMessage(importDataTranslations("cardImportData.errorDescription"));
      setIsImporting(false);
    }
  };

  return (
    <WalletGuard
      onAuthorized={setPassword}
      onCancel={onHide}
      title={importDataTranslations("cardImportData.modalTitle")}
      passwordLabel={importDataTranslations("cardImportData.passwordLabel")}
      confirmText={importDataTranslations("cardImportData.confirmButton")}
      cancelText={importDataTranslations("cardImportData.cancelButton")}
    >
      <Card shadow="none" className="rounded-lg p-6 shadow-lg">
        <CardHeader className="flex flex-col items-start pb-0">
          <h2 className="text-lg sm:text-xl xl:text-2xl font-semibold text-green-900">
            {importDataTranslations("cardImportData.title")}
          </h2>
        </CardHeader>

        <CardBody>
          {isImporting ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <Spinner size="lg" color="success" />
              <p className="text-sm text-gray-500">
                {importDataTranslations("cardImportData.importing")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {importDataTranslations("cardImportData.fileLabel")}
                </label>
                <input type="file" accept=".zip,application/zip" onChange={handleFileChange} />
                <p className="text-sm text-gray-500 mt-1">
                  {importDataTranslations("cardImportData.fileHint")}
                </p>
              </div>

              {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}

              <Button
                color="primary"
                onPress={handleContinue}
                className="bg-green-800 self-start"
              >
                {importDataTranslations("cardImportData.continueButton")}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <ImportBackupConfirmModal
        isOpen={isConfirmModalOpen}
        onOpenChange={setIsConfirmModalOpen}
        onConfirm={handleConfirmImport}
        importDataTranslations={importDataTranslations}
      />
    </WalletGuard>
  );
}
