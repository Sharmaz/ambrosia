"use client";

import { useTranslations } from "next-intl";

import { BusinessLayout } from "@components/shared/BusinessLayout";

export function FreelancerLayout({ children }) {
  const navbarTranslations = useTranslations("freelancerNavbar");

  return (
    <BusinessLayout navbarTranslations={navbarTranslations}>
      {children}
    </BusinessLayout>
  );
}
