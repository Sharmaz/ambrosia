import { act, renderHook, waitFor } from "@testing-library/react";

import { httpClient, parseJsonResponse } from "@/lib/http";

import { useTimesheetCatalog } from "../useTimesheetCatalog";

jest.mock("@/lib/http", () => ({
  httpClient: jest.fn(),
  parseJsonResponse: jest.fn(),
}));

describe("useTimesheetCatalog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the clients, the in progress projects and the tasks", async () => {
    const clients = [{ id: "client-id", name: "Acme" }];
    const projects = [{ id: "project-id", clientId: "client-id", name: "Website" }];
    const tasks = [{ id: "task-id", name: "Development" }];
    const catalogByEndpoint = {
      "/freelance/clients": clients,
      "/freelance/projects?status=in_progress": projects,
      "/freelance/tasks": tasks,
    };
    httpClient.mockImplementation((catalogEndpoint) => Promise.resolve({ ok: true, endpoint: catalogEndpoint }));
    parseJsonResponse.mockImplementation((catalogResponse) => Promise.resolve(catalogByEndpoint[catalogResponse.endpoint]));

    const { result: catalogHook } = renderHook(() => useTimesheetCatalog());
    await waitFor(() => expect(catalogHook.current.loading).toBe(false));

    expect(httpClient).toHaveBeenCalledWith("/freelance/projects?status=in_progress", { skipForbiddenRedirect: true });
    expect(httpClient).toHaveBeenCalledWith("/freelance/tasks", { skipForbiddenRedirect: true });
    expect(httpClient).toHaveBeenCalledWith("/freelance/clients", { skipForbiddenRedirect: true });
    expect(catalogHook.current.clients).toEqual(clients);
    expect(catalogHook.current.projects).toEqual(projects);
    expect(catalogHook.current.tasks).toEqual(tasks);
  });

  it("normalizes empty list messages and failed responses to empty arrays", async () => {
    const emptyListMessagesByEndpoint = {
      "/freelance/clients": "No clients found",
      "/freelance/tasks": "No tasks found",
    };
    httpClient.mockImplementation((catalogEndpoint) => Promise.resolve(
      catalogEndpoint.startsWith("/freelance/projects")
        ? { ok: false, status: 403, endpoint: catalogEndpoint }
        : { ok: true, status: 200, endpoint: catalogEndpoint },
    ));
    parseJsonResponse.mockImplementation((catalogResponse) => Promise.resolve(
      emptyListMessagesByEndpoint[catalogResponse.endpoint],
    ));

    const { result: catalogHook } = renderHook(() => useTimesheetCatalog());
    await waitFor(() => expect(catalogHook.current.loading).toBe(false));

    expect(catalogHook.current.clients).toEqual([]);

    expect(catalogHook.current.projects).toEqual([]);
    expect(catalogHook.current.tasks).toEqual([]);
  });

  it("creates a task, reloads the tasks and returns the new id", async () => {
    const createdTask = { id: "created-task-id", name: "Code review" };
    httpClient.mockResolvedValue({ ok: true, status: 200 });
    parseJsonResponse.mockResolvedValue([]);
    const { result: catalogHook } = renderHook(() => useTimesheetCatalog());
    await waitFor(() => expect(catalogHook.current.loading).toBe(false));
    httpClient.mockClear();
    parseJsonResponse
      .mockResolvedValueOnce({ id: "created-task-id", message: "Task added successfully" })
      .mockResolvedValueOnce([createdTask]);

    let createdTaskId;
    await act(async () => {
      createdTaskId = await catalogHook.current.createTask("Code review");
    });

    expect(httpClient).toHaveBeenNthCalledWith(1, "/freelance/tasks", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "Code review", isBillable: true }),
    }));
    expect(httpClient).toHaveBeenNthCalledWith(2, "/freelance/tasks", { skipForbiddenRedirect: true });
    expect(createdTaskId).toBe("created-task-id");
    expect(catalogHook.current.tasks).toEqual([createdTask]);
  });

  it("throws when the task cannot be created", async () => {
    httpClient.mockResolvedValue({ ok: true, status: 200 });
    parseJsonResponse.mockResolvedValue([]);
    const { result: catalogHook } = renderHook(() => useTimesheetCatalog());
    await waitFor(() => expect(catalogHook.current.loading).toBe(false));
    httpClient.mockResolvedValueOnce({ ok: false, status: 400 });
    parseJsonResponse.mockResolvedValueOnce(null);

    await act(async () => {
      await expect(catalogHook.current.createTask("")).rejects.toMatchObject({ status: 400 });
    });
  });
});
