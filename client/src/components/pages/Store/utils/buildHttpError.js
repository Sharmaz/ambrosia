import { parseJsonResponse } from "@/lib/http";

export function buildHttpError(httpResponse, fallbackMessage = "Request failed", parsedResponseBody = null) {
  const requestError = new Error(fallbackMessage);
  requestError.status = httpResponse?.status;
  requestError.responseMessage = parsedResponseBody?.message;
  return requestError;
}

export async function buildParsedHttpError(httpResponse, fallbackMessage = "Request failed") {
  const parsedResponseBody = await parseJsonResponse(httpResponse, null);
  return buildHttpError(httpResponse, fallbackMessage, parsedResponseBody);
}
