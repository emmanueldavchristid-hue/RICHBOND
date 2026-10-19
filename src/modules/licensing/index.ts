export { activateLicense, ensureLicense, extendTrial, getLicenseState, type LicenseView } from "./service";
export { isWritable, isWritableNow, requireWritable } from "./guard";
export { activateLicenseSchema, extendTrialSchema, type ActivateLicenseInput, type ExtendTrialInput } from "./schemas";
export {
  computeLicenseState,
  computeTrialEnd,
  formatBadge,
  formatCountdown,
  trialProgress,
  READ_ONLY_MESSAGE,
  type LicenseState,
  type LicenseTone,
} from "./state";
