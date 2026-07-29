export const SETTINGS_STORAGE_VERSION = 4;

const ZERO_DAMPING_PATCH = Object.freeze({
  housingAngularDamping: 0,
});

const OBSOLETE_PLUNGER_SETTINGS = Object.freeze([
  "plungerBrakingAcceleration",
  "plungerSettlingTime",
  "plungerResponseDistance",
  "plungerTravelLeadDistance",
  "plungerGripLeadDistance",
  "plungerGripEngagementDistance",
  "plungerEffectiveMass",
  "plungerDampingRatio",
  "plungerGripDampingMultiplier",
  "plungerReleaseSpeedMultiplier",
  "plungerClosedStroke",
]);

export function migratePersistedSettings(settings, version) {
  if (version >= SETTINGS_STORAGE_VERSION) return settings;
  const migrated = {
    ...settings,
  };
  for (const setting of OBSOLETE_PLUNGER_SETTINGS) {
    delete migrated[setting];
  }
  return version < 3
    ? { ...migrated, ...ZERO_DAMPING_PATCH }
    : migrated;
}
