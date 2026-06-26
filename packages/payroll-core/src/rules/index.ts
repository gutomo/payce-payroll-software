import type { CountryRulePack } from "../rule-pack";
import { inRulePack } from "./in";
import { ukRulePack } from "./uk";
import { usRulePack } from "./us";

export { inRulePack } from "./in";
export { ukRulePack } from "./uk";
export { usRulePack } from "./us";

/** Reference rule packs keyed by ISO 3166-1 alpha-2 country code (UK is "GB"). */
export const rulePacks: Record<string, CountryRulePack> = {
  US: usRulePack,
  GB: ukRulePack,
  IN: inRulePack,
};
