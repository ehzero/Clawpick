import assert from "node:assert/strict";
import test from "node:test";
import {
  createSettingsStorage,
  LEGACY_SETTINGS_KEY,
  LEGACY_SETTINGS_VERSION_KEY,
  SETTINGS_STORAGE_KEY,
} from "../game/settingsStorage.mjs";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
    size: () => map.size,
  };
}

test("persisted tuning round-trips through the adapter", () => {
  const storage = fakeStorage();
  const adapter = createSettingsStorage(() => storage);

  adapter.setItem(SETTINGS_STORAGE_KEY, {
    state: { settings: { moveSpeed: 1.1 } },
    version: 5,
  });

  assert.deepEqual(adapter.getItem(SETTINGS_STORAGE_KEY), {
    state: { settings: { moveSpeed: 1.1 } },
    version: 5,
  });
});

test("a preset saved by the old panel is imported with its own version", () => {
  const storage = fakeStorage({
    [LEGACY_SETTINGS_KEY]: JSON.stringify({
      moveSpeed: 2.1,
      housingAngularDamping: 0.42,
    }),
    [LEGACY_SETTINGS_VERSION_KEY]: "2",
  });
  const adapter = createSettingsStorage(() => storage);

  assert.deepEqual(adapter.getItem(SETTINGS_STORAGE_KEY), {
    state: { settings: { moveSpeed: 2.1, housingAngularDamping: 0.42 } },
    version: 2,
  });
});

test("the legacy keys are consumed so the import happens only once", () => {
  const storage = fakeStorage({
    [LEGACY_SETTINGS_KEY]: JSON.stringify({ moveSpeed: 2.1 }),
    [LEGACY_SETTINGS_VERSION_KEY]: "2",
  });
  const adapter = createSettingsStorage(() => storage);

  adapter.getItem(SETTINGS_STORAGE_KEY);

  assert.equal(storage.has(LEGACY_SETTINGS_KEY), false);
  assert.equal(storage.has(LEGACY_SETTINGS_VERSION_KEY), false);
  assert.equal(adapter.getItem(SETTINGS_STORAGE_KEY), null);
});

test("a legacy preset with no recorded version migrates from zero", () => {
  const storage = fakeStorage({
    [LEGACY_SETTINGS_KEY]: JSON.stringify({ moveSpeed: 2.1 }),
  });
  const adapter = createSettingsStorage(() => storage);

  assert.equal(adapter.getItem(SETTINGS_STORAGE_KEY).version, 0);
});

test("unreadable stored values are discarded instead of thrown", () => {
  const corruptNew = fakeStorage({ [SETTINGS_STORAGE_KEY]: "{{{" });
  const newAdapter = createSettingsStorage(() => corruptNew);
  assert.equal(newAdapter.getItem(SETTINGS_STORAGE_KEY), null);
  assert.equal(corruptNew.has(SETTINGS_STORAGE_KEY), false);

  const corruptLegacy = fakeStorage({
    [LEGACY_SETTINGS_KEY]: "not json",
    [LEGACY_SETTINGS_VERSION_KEY]: "3",
  });
  const legacyAdapter = createSettingsStorage(() => corruptLegacy);
  assert.equal(legacyAdapter.getItem(SETTINGS_STORAGE_KEY), null);
  assert.equal(corruptLegacy.size(), 0, "corrupt legacy keys are cleared too");
});

test("the newer format wins and leaves the legacy keys untouched", () => {
  const storage = fakeStorage({
    [SETTINGS_STORAGE_KEY]: JSON.stringify({
      state: { settings: { moveSpeed: 1 } },
      version: 5,
    }),
    [LEGACY_SETTINGS_KEY]: JSON.stringify({ moveSpeed: 9 }),
  });
  const adapter = createSettingsStorage(() => storage);

  assert.equal(
    adapter.getItem(SETTINGS_STORAGE_KEY).state.settings.moveSpeed,
    1,
  );
  assert.equal(storage.has(LEGACY_SETTINGS_KEY), true);
});

test("the adapter is inert when there is no storage at all", () => {
  const adapter = createSettingsStorage(() => null);

  assert.equal(adapter.getItem(SETTINGS_STORAGE_KEY), null);
  assert.doesNotThrow(() => adapter.setItem(SETTINGS_STORAGE_KEY, { a: 1 }));
  assert.doesNotThrow(() => adapter.removeItem(SETTINGS_STORAGE_KEY));
});
