const CREATE_TASK_OPTION_PREFIX = "create-task:";

export function normalizeTaskName(taskName) {
  return taskName.trim().toLocaleLowerCase();
}

export function buildCreateTaskOptionKey(taskName) {
  return `${CREATE_TASK_OPTION_PREFIX}${taskName}`;
}

export function isCreateTaskOptionKey(optionKey) {
  return typeof optionKey === "string" && optionKey.startsWith(CREATE_TASK_OPTION_PREFIX);
}

export function parseCreateTaskOptionName(optionKey) {
  return optionKey.slice(CREATE_TASK_OPTION_PREFIX.length);
}
