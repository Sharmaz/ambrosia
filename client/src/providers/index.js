"use client";

import { useEffect, useState } from "react";

import { HeroUIProvider, ToastProvider } from "@heroui/react";

import { I18nProvider } from "@/i18n/I18nProvider";
import { AuthProvider } from "@/providers/auth/AuthProvider";
import { ConfigurationsProvider } from "@/providers/configurations/configurationsProvider";
import {
  DisplayContextProvider,
  getInitialDisableAnimation,
  persistDisableAnimation,
} from "@/providers/display/DisplayProvider";
import { TurnProvider } from "@/providers/turn/TurnProvider";

export default function Providers({ children }) {
  const [disableAnimation, setDisableAnimation] = useState(false);

  useEffect(() => {
    setDisableAnimation(getInitialDisableAnimation());
  }, []);

  const handleSetDisableAnimation = (value) => {
    persistDisableAnimation(value);
    window.location.reload();
  };

  return (
    <>
      <AuthProvider>
        <ConfigurationsProvider>
          <I18nProvider>
            <TurnProvider>
              <DisplayContextProvider value={{ disableAnimation, setDisableAnimation: handleSetDisableAnimation }}>
                <HeroUIProvider disableAnimation={disableAnimation}>
                  <ToastProvider placement="top-right" maxVisibleToasts={1} />
                  {children}
                </HeroUIProvider>
              </DisplayContextProvider>
            </TurnProvider>
          </I18nProvider>
        </ConfigurationsProvider>
      </AuthProvider>
    </>
  );
}
