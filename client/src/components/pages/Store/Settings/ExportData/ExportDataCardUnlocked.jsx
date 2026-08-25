"use client";

import { Card, CardBody, CardHeader, Spinner } from "@heroui/react";

import WalletGuard from "@components/auth/WalletGuard";

export function ExportDataCardUnlocked({ onAuthorized, onHide, exportDataTranslations }) {
  return (
    <WalletGuard
      onAuthorized={onAuthorized}
      onCancel={onHide}
      title={exportDataTranslations("cardExportData.modalTitle")}
      passwordLabel={exportDataTranslations("cardExportData.passwordLabel")}
      confirmText={exportDataTranslations("cardExportData.confirmButton")}
      cancelText={exportDataTranslations("cardExportData.cancelButton")}
    >
      <Card shadow="none" className="rounded-lg p-6 shadow-lg">
        <CardHeader className="flex flex-col items-start pb-0">
          <h2 className="text-lg sm:text-xl xl:text-2xl font-semibold text-green-900">
            {exportDataTranslations("cardExportData.title")}
          </h2>
        </CardHeader>

        <CardBody>
          <div className="flex flex-col items-center gap-2 py-6">
            <Spinner size="lg" color="success" />
            <p className="text-sm text-gray-500">
              {exportDataTranslations("cardExportData.exporting")}
            </p>
          </div>
        </CardBody>
      </Card>
    </WalletGuard>
  );
}
