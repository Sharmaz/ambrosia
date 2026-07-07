"use client";

import { createContext, useContext } from "react";

const STORAGE_KEY = "ambrosia_disable_animations";

export const DisplayContext = createContext({
  disableAnimation: false,
  setDisableAnimation: () => {},
});

export function useDisplaySettings() {
  return useContext(DisplayContext);
}

export function getInitialDisableAnimation() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function persistDisableAnimation(value) {
  localStorage.setItem(STORAGE_KEY, String(value));
}
