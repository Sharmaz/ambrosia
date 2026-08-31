import { isElectron } from "@lib/isElectron";

export async function restartBackendAfterImport() {
  if (!isElectron) {
    return false;
  }

  await window.electron.ipc.invoke("services:restart", "backend");
  return true;
}
