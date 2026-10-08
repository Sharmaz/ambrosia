import { addToast } from "@heroui/react";
import { act, renderHook } from "@testing-library/react";

import { useTaskSelector } from "../useTaskSelector";

jest.mock("@heroui/react", () => ({
  addToast: jest.fn(),
}));

const tasks = [
  { id: "development-id", name: "Development" },
  { id: "design-id", name: "Design" },
];

function renderUseTaskSelector(hookOptions = {}) {
  const onTaskChange = jest.fn();
  const createTask = jest.fn().mockResolvedValue("created-task-id");
  const renderedTaskSelectorHook = renderHook(() => useTaskSelector({
    tasks,
    onTaskChange,
    createTask,
    canCreateTask: true,
    ...hookOptions,
  }));
  return { ...renderedTaskSelectorHook, onTaskChange, createTask };
}

describe("useTaskSelector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("offers to create the typed task when no task has that name", () => {
    const { result: taskSelectorHook } = renderUseTaskSelector();

    act(() => taskSelectorHook.current.setSearchValue("  Code review "));

    expect(taskSelectorHook.current.typedTaskName).toBe("Code review");
    expect(taskSelectorHook.current.createTaskOptionKey).toBe("create-task:Code review");
  });

  it("does not offer to create a task that already exists ignoring case", () => {
    const { result: taskSelectorHook } = renderUseTaskSelector();

    act(() => taskSelectorHook.current.setSearchValue("development"));

    expect(taskSelectorHook.current.createTaskOptionKey).toBeNull();
  });

  it("does not offer to create tasks without the create permission", () => {
    const { result: taskSelectorHook } = renderUseTaskSelector({ canCreateTask: false });

    act(() => taskSelectorHook.current.setSearchValue("Code review"));

    expect(taskSelectorHook.current.createTaskOptionKey).toBeNull();
  });

  it("selects an existing task", () => {
    const { result: taskSelectorHook, onTaskChange, createTask } = renderUseTaskSelector();

    act(() => taskSelectorHook.current.handleSelectionChange("design-id"));

    expect(onTaskChange).toHaveBeenCalledWith("design-id");
    expect(createTask).not.toHaveBeenCalled();
  });

  it("clears the task when the selection is removed", () => {
    const { result: taskSelectorHook, onTaskChange } = renderUseTaskSelector();

    act(() => taskSelectorHook.current.handleSelectionChange(null));

    expect(onTaskChange).toHaveBeenCalledWith("");
  });

  it("creates the task and selects it", async () => {
    const { result: taskSelectorHook, onTaskChange, createTask } = renderUseTaskSelector();

    await act(async () => {
      await taskSelectorHook.current.handleSelectionChange("create-task:Code review");
    });

    expect(createTask).toHaveBeenCalledWith("Code review");
    expect(onTaskChange).toHaveBeenCalledWith("created-task-id");
    expect(taskSelectorHook.current.isCreatingTask).toBe(false);
  });

  it("shows a toast and keeps the selection empty when the task cannot be created", async () => {
    const createTask = jest.fn().mockRejectedValue({ responseMessage: "Invalid task data" });
    const { result: taskSelectorHook, onTaskChange } = renderUseTaskSelector({ createTask });

    await act(async () => {
      await taskSelectorHook.current.handleSelectionChange("create-task:Code review");
    });

    expect(onTaskChange).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Invalid task data" }));
  });
});
