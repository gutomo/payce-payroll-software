import type { CountryRulePack } from "../rule-pack";
import { usRulePack } from "./us";

export { usRulePack } from "./us";

/** Reference rule packs keyed by ISO 3166-1 alpha-2 country code. UK/IN land in later Phase 3 slices. */
export const rulePacks: Record<string, CountryRulePack> = {
  US: usRulePack,
};
