"use client";

import { useState } from "react";

import { HeroUIProvider, ToastProvider } from "@heroui/react";

import { I18nProvider } from "@/i18n/I18nProvider";
import { AuthProvider } from "@/providers/auth/AuthProvider";
import { ConfigurationsProvider } from "@/providers/configurations/configurationsProvider";
import {
  DisplayContext,
  getInitialDisableAnimation,
  persistDisableAnimation,
} from "@/providers/display/DisplayProvider";
import { TurnProvider } from "@/providers/turn/TurnProvider";

export default function Providers({ children }) {
  const [disableAnimation, setDisableAnimation] = useState(getInitialDisableAnimation);

  const handleSetDisableAnimation = (value) => {
    persistDisableAnimation(value);
    setDisableAnimation(value);
  };

  return (
    <>
      <AuthProvider>
        <ConfigurationsProvider>
          <I18nProvider>
            <TurnProvider>
              <DisplayContext.Provider value={{ disableAnimation, setDisableAnimation: handleSetDisableAnimation }}>
                <HeroUIProvider disableAnimation={disableAnimation}>
                  <ToastProvider placement="top-right" maxVisibleToasts={1} />
                  {children}
                </HeroUIProvider>
              </DisplayContext.Provider>
            </TurnProvider>
          </I18nProvider>
        </ConfigurationsProvider>
      </AuthProvider>
    </>
  );
}
