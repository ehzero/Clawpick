export const SETTINGS_STORAGE_KEY = "clawpick-physics-settings";
export const LEGACY_SETTINGS_KEY = "clawpick-settings";
export const LEGACY_SETTINGS_VERSION_KEY = "clawpick-settings-version";

/**
 * Storage adapter for the persisted physics tuning.
 *
 * Beyond the plain read/write it folds in whatever the previous hand-rolled
 * TuningPanel persistence left in localStorage, so an existing preset survives
 * the move into the store. The legacy keys are consumed exactly once, whether
 * or not they parse.
 *
 * `getStorage` returns a localStorage-like object, or null when there is none
 * (server rendering, or a browser with storage blocked).
 */
export function createSettingsStorage(getStorage) {
  return {
    getItem(name) {
      const storage = getStorage();
      if (!storage) return null;

      const stored = storage.getItem(name);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          storage.removeItem(name);
          return null;
        }
      }

      const legacy = storage.getItem(LEGACY_SETTINGS_KEY);
      const legacyVersion = storage.getItem(LEGACY_SETTINGS_VERSION_KEY);
      storage.removeItem(LEGACY_SETTINGS_KEY);
      storage.removeItem(LEGACY_SETTINGS_VERSION_KEY);
      if (!legacy) return null;

      try {
        const version = Number(legacyVersion ?? 0);
        return {
          state: { settings: JSON.parse(legacy) },
          version: Number.isFinite(version) ? version : 0,
        };
      } catch {
        return null;
      }
    },

    setItem(name, value) {
      const storage = getStorage();
      if (!storage) return;
      storage.setItem(name, JSON.stringify(value));
    },

    removeItem(name) {
      const storage = getStorage();
      if (!storage) return;
      storage.removeItem(name);
    },
  };
}
