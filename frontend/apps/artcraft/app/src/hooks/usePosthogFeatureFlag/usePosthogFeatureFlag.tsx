import { FeatureFlags } from "~/enums/FeatureFlags";
import environmentVariables from "~/Classes/EnvironmentVariables";

export const usePosthogFeatureFlag = (_flag: FeatureFlags): boolean =>
  environmentVariables.values.DEPLOY_CONTEXT === "DEVELOPMENT";
