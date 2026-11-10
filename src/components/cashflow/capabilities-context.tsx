"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Permission } from "@/lib/auth/permissions";

/**
 * What the signed-in person may do (their privileges), provided once by the
 * Cashflow layout so buttons can hide without every page passing flags down.
 * This only tidies the screen: every server action checks the same privilege.
 */
const CapabilitiesContext = createContext<readonly string[]>([]);

export function CapabilitiesProvider({
  permissions,
  children,
}: {
  permissions: readonly string[];
  children: ReactNode;
}) {
  return (
    <CapabilitiesContext.Provider value={permissions}>
      {children}
    </CapabilitiesContext.Provider>
  );
}

export function useCan(permission: Permission): boolean {
  return useContext(CapabilitiesContext).includes(permission);
}
