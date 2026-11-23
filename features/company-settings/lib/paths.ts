/**
 * Where the feature is mounted: a company's settings, `/entity/<shortid>/<name>/settings/<tab>`
 * (the shell spells the company's pages - `lib/hubPaths.ts` - and this feature owns three tabs).
 */

import { companySettingsPath } from "@/lib/hubPaths";

export function usersPath(entityId: string, entityName: string): string {
  return companySettingsPath(entityId, entityName, "users");
}

export function generalPath(entityId: string, entityName: string): string {
  return companySettingsPath(entityId, entityName, "general");
}

export function integrationPath(entityId: string, entityName: string): string {
  return companySettingsPath(entityId, entityName, "integration");
}

/** The Petty Cash Settings tab (another feature's; a feature never imports one) - where matching sends a company still missing daily closing's contacts. */
export function pettyCashTabPath(entityId: string, entityName: string): string {
  return companySettingsPath(entityId, entityName, "petty-cash");
}

/** Match your accounts to Xero (Settings Phase 2): under Integration, where a Minty company's connect lands. */
export function matchingPath(entityId: string, entityName: string): string {
  return `${integrationPath(entityId, entityName)}/match`;
}
