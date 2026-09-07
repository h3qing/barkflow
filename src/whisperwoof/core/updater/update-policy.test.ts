/**
 * Tests for the update policy behind src/updater.js — imports the real
 * bridge module so the decisions the app makes cannot drift from these.
 */
import { describe, it, expect } from "vitest";
import {
  resolveUpdateMode,
  shouldShowUpdateNotification,
  releasePageUrl,
} from "../../bridge/update-policy-pure.js";

describe("resolveUpdateMode", () => {
  it("development builds never check", () => {
    expect(resolveUpdateMode({ nodeEnv: "development", packageMode: undefined })).toEqual({
      mode: "off",
      reason: "development",
    });
  });

  it("a local/CI build (extraMetadata whisperwoofUpdateMode=off) never checks", () => {
    expect(resolveUpdateMode({ nodeEnv: "production", packageMode: "off" })).toEqual({
      mode: "off",
      reason: "local-build",
    });
  });

  it("an unsigned release build (manual) checks but hands off to the browser", () => {
    expect(resolveUpdateMode({ nodeEnv: "production", packageMode: "manual" })).toEqual({
      mode: "manual",
      reason: null,
    });
  });

  it("a build without the stamp keeps electron-updater's automatic flow", () => {
    expect(resolveUpdateMode({ nodeEnv: undefined, packageMode: undefined }).mode).toBe("auto");
    expect(resolveUpdateMode({ nodeEnv: "production", packageMode: "garbage" }).mode).toBe("auto");
  });

  it("development wins over any package stamp", () => {
    expect(resolveUpdateMode({ nodeEnv: "development", packageMode: "manual" }).mode).toBe("off");
  });
});

describe("shouldShowUpdateNotification", () => {
  it("shows a new version when nothing was skipped", () => {
    expect(shouldShowUpdateNotification({ version: "1.16.0", skippedVersion: "" })).toBe(true);
    expect(shouldShowUpdateNotification({ version: "1.16.0", skippedVersion: undefined })).toBe(
      true
    );
  });

  it("stays quiet for the version the user skipped — across restarts and re-checks", () => {
    expect(shouldShowUpdateNotification({ version: "1.16.0", skippedVersion: "1.16.0" })).toBe(
      false
    );
    expect(shouldShowUpdateNotification({ version: " 1.16.0 ", skippedVersion: "1.16.0" })).toBe(
      false
    );
  });

  it("shows again once a newer version than the skipped one appears", () => {
    expect(shouldShowUpdateNotification({ version: "1.17.0", skippedVersion: "1.16.0" })).toBe(
      true
    );
  });

  it("never shows without a version", () => {
    expect(shouldShowUpdateNotification({ version: undefined, skippedVersion: "" })).toBe(false);
  });
});

describe("releasePageUrl", () => {
  it("points at the tagged release, tolerating a leading v", () => {
    expect(releasePageUrl("1.16.0")).toBe("https://github.com/h3qing/whisperwoof/releases/tag/v1.16.0");
    expect(releasePageUrl("v1.16.0")).toBe("https://github.com/h3qing/whisperwoof/releases/tag/v1.16.0");
  });

  it("falls back to the latest release without a version", () => {
    expect(releasePageUrl(undefined)).toBe("https://github.com/h3qing/whisperwoof/releases/latest");
  });
});
