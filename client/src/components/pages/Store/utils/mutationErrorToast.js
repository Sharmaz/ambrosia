export function isAdminPrivilegesRequired(requestError) {
  return requestError?.status === 403 && requestError?.responseMessage === "Admin privileges required";
}

export function isCurrentUserPinIncorrect(requestError) {
  return requestError?.status === 401 && requestError?.responseMessage === "Current PIN is incorrect";
}

export function isLastAdminConflict(requestError) {
  return requestError?.status === 409 && requestError?.responseMessage?.includes("last admin");
}

export function isConflict(requestError) {
  return requestError?.status === 409;
}

export function resolveMutationErrorToast(requestError, rules, fallbackToast) {
  const matchedRule = rules.find((rule) => rule.when(requestError));
  return matchedRule ? matchedRule.toast : fallbackToast;
}

export function translateToast(translate, titleKey, descriptionKey, color) {
  return {
    title: translate(titleKey),
    description: translate(descriptionKey),
    color,
  };
}
