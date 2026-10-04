"use client";
import { useState, useEffect, useCallback } from "react";

import { buildParsedHttpError } from "@/components/pages/Store/utils/buildHttpError";
import { toArray } from "@/components/utils/array";
import { httpClient, parseJsonResponse } from "@/lib/http";

export function useTimesheetCatalog() {
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTasks = useCallback(async () => {
    const tasksResponse = await httpClient("/freelance/tasks", { skipForbiddenRedirect: true });
    const fetchedTasks = tasksResponse.ok ? await parseJsonResponse(tasksResponse, []) : [];
    setTasks(toArray(fetchedTasks));
  }, []);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientsResponse, projectsResponse] = await Promise.all([
        httpClient("/freelance/clients", { skipForbiddenRedirect: true }),
        httpClient("/freelance/projects?status=in_progress", { skipForbiddenRedirect: true }),
        fetchTasks(),
      ]);
      const fetchedClients = clientsResponse.ok ? await parseJsonResponse(clientsResponse, []) : [];
      const fetchedProjects = projectsResponse.ok ? await parseJsonResponse(projectsResponse, []) : [];
      setClients(toArray(fetchedClients));
      setProjects(toArray(fetchedProjects));
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [fetchTasks]);

  const createTask = useCallback(async (taskName) => {
    const createTaskResponse = await httpClient("/freelance/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: taskName, isBillable: true }),
      notShowError: false,
      skipForbiddenRedirect: true,
    });
    if (!createTaskResponse.ok) {
      throw await buildParsedHttpError(createTaskResponse, "Error creating task");
    }
    const createdTask = await parseJsonResponse(createTaskResponse, {});

    await fetchTasks();
    return createdTask?.id;
  }, [fetchTasks]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return { clients, projects, tasks, loading, error, createTask, refetch: fetchCatalog };
}
