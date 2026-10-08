"use client";

import { Autocomplete, AutocompleteItem, Input } from "@heroui/react";
import { useTranslations } from "next-intl";

import { useTaskSelector } from "./hooks/useTaskSelector";

export function TaskSelector({ tasks, selectedTaskId, onTaskChange, createTask, canCreateTask, isDisabled = false, isReadOnly = false, isRequired = true }) {
  const timesheetTranslations = useTranslations("timesheet");
  const {
    setSearchValue,
    typedTaskName,
    createTaskOptionKey,
    isCreatingTask,
    handleSelectionChange,
  } = useTaskSelector({ tasks, onTaskChange, createTask, canCreateTask });
  const createTaskOptionLabel = createTaskOptionKey
    ? timesheetTranslations("modal.createTaskOption", { name: typedTaskName })
    : null;
  const showEmptyTasksMessage = tasks.length === 0 && !createTaskOptionKey;

  if (isReadOnly) {
    const selectedTaskName = tasks.find((task) => task.id === selectedTaskId)?.name ?? "";
    return (
      <Input
        label={timesheetTranslations("modal.taskLabel")}
        isReadOnly
        value={selectedTaskName}
        classNames={{ inputWrapper: "bg-transparent shadow-none px-0 rounded-none border-b border-gray-100 data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent" }}
      />
    );
  }

  return (
    <Autocomplete
      label={timesheetTranslations("modal.taskLabel")}
      placeholder={timesheetTranslations("modal.taskPlaceholder")}
      isRequired={isRequired}
      allowsCustomValue
      allowsEmptyCollection
      menuTrigger="focus"
      isLoading={isCreatingTask}
      isDisabled={isDisabled}
      description={isDisabled ? timesheetTranslations("modal.selectProjectFirst") : undefined}
      selectedKey={selectedTaskId || null}
      onInputChange={setSearchValue}
      onSelectionChange={handleSelectionChange}
    >
      {tasks.map((task) => (
        <AutocompleteItem key={task.id} textValue={task.name}>
          {task.name}
        </AutocompleteItem>
      ))}

      {showEmptyTasksMessage ? (
        <AutocompleteItem key="empty-tasks" isDisabled textValue={timesheetTranslations("modal.noTasks")}>
          {timesheetTranslations("modal.noTasks")}
        </AutocompleteItem>
      ) : null}

      {createTaskOptionKey ? (
        <AutocompleteItem key={createTaskOptionKey} textValue={createTaskOptionLabel}>
          {createTaskOptionLabel}
        </AutocompleteItem>
      ) : null}
    </Autocomplete>
  );
}
