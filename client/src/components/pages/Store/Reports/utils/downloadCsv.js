export function downloadCsv(csvContent, filename) {
  const csvDownloadUrl = URL.createObjectURL(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }));
  const downloadLink = document.createElement("a");
  downloadLink.href = csvDownloadUrl;
  downloadLink.download = filename;
  try {
    downloadLink.click();
  } finally {
    URL.revokeObjectURL(csvDownloadUrl);
  }
}
