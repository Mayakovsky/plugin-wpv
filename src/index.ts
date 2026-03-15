// ════════════════════════════════════════════
// @elizaos/plugin-wpv — Whitepaper Verification Plugin
// ════════════════════════════════════════════

import type { Plugin } from "@elizaos/core";
import type { PgTable, TableConfig } from "drizzle-orm/pg-core";
import { WpvScanAction } from "./actions/wpvScanAction";
import { WpvVerifyAction } from "./actions/wpvVerifyAction";
import { WpvStatusAction } from "./actions/wpvStatusAction";
import { WpvCostAction } from "./actions/wpvCostAction";
import { WpvGreenlightAction } from "./actions/wpvGreenlightAction";
import { WpvAlertsAction } from "./actions/wpvAlertsAction";
import { WpvService } from "./WpvService";
import { wpvWhitepapers, wpvClaims, wpvVerifications } from "./db/wpvSchema";

const wpvSchema: Record<string, PgTable<TableConfig>> = {
  wpvWhitepapers,
  wpvClaims,
  wpvVerifications,
};

export const wpvPlugin: Plugin = {
  name: "wpv",
  description: "Whitepaper Verification Pipeline — crypto whitepaper analysis and verification",
  actions: [
    WpvScanAction,
    WpvVerifyAction,
    WpvStatusAction,
    WpvCostAction,
    WpvGreenlightAction,
    WpvAlertsAction,
  ],
  services: [WpvService],
  schema: wpvSchema,
};

export default wpvPlugin;

// Re-export key types and classes for external use
export { WpvService } from "./WpvService";
export type { WpvServiceDeps } from "./WpvService";
export * from "./types";
export * from "./constants";
