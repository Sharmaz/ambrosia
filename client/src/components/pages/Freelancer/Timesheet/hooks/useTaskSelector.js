"use client";
import { useState } from "react";

import { addToast } from "@heroui/react";
import { useTranslations } from "next-intl";

import {
  buildCreateTaskOptionKey,
  isCreateTaskOptionKey,
  normalizeTaskName,
  parseCreateTaskOptionName,
} from "../utils/taskSelector";

export function useTaskSelector({ tasks, onTaskChange, createTask, canCreateTask }) {
  const timesheetTranslations = useTranslations("timesheet");
  const [searchValue, setSearchValue] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const typedTaskName = searchValue.trim();
  const hasMatchingTask = tasks.some((task) => normalizeTaskName(task.name) === normalizeTaskName(typedTaskName));
  const createTaskOptionKey = canCreateTask && typedTaskName && !hasMatchingTask
    ? buildCreateTaskOptionKey(typedTaskName)
    : null;

  const handleCreateTask = async (taskName) => {
    if (isCreatingTask) return;
    setIsCreatingTask(true);
    try {
      const createdTaskId = await createTask(taskName);
      if (createdTaskId) onTaskChange(createdTaskId);
    } catch (createTaskError) {
      addToast({
        title: timesheetTranslations("toasts.genericErrorTitle"),
        description: createTaskError?.responseMessage || timesheetTranslations("toasts.createTaskError"),
        color: "danger",
      });
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleSelectionChange = (selectedOptionKey) => {
    if (!selectedOptionKey) {
      onTaskChange("");
      return;
    }

    if (isCreateTaskOptionKey(selectedOptionKey)) {
      handleCreateTask(parseCreateTaskOptionName(selectedOptionKey));
      return;
    }

    onTaskChange(String(selectedOptionKey));
  };

  return {
    setSearchValue,
    typedTaskName,
    createTaskOptionKey,
    isCreatingTask,
    handleSelectionChange,
  };
}
