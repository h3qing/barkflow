/**
 * Update policy — pure decisions behind src/updater.js, so the "why did the
 * update popup appear" question has unit-testable answers.
 *
 * Every macOS build this fork produces is unsigned (fresh-install-mac.sh,
 * ci.yml and release.yml all pass --config.mac.identity=null), and Squirrel
 * refuses to install an unsigned app — so the in-app "Update Now" flow can
 * never finish. The build stamps its intent into package.json via
 * electron-builder's extraMetadata (`whisperwoofUpdateMode`):
 *
 *   "off"     local / CI test builds: never check, never prompt. You update
 *             by pulling and rebuilding.
 *   "manual"  unsigned release builds: check and notify, but the call to
 *             action opens the GitHub release page for a manual download.
 *   "auto"    (absent) a signed build: electron-updater downloads + installs.
 */

const RELEASES_BASE = "https://github.com/h3qing/whisperwoof/releases";

/**
 * @param {{ nodeEnv?: string, packageMode?: unknown }} input
 * @returns {{ mode: "off"|"manual"|"auto", reason: "development"|"local-build"|null }}
 */
function resolveUpdateMode({ nodeEnv, packageMode }) {
  if (nodeEnv === "development") return { mode: "off", reason: "development" };
  if (packageMode === "off") return { mode: "off", reason: "local-build" };
  if (packageMode === "manual") return { mode: "manual", reason: null };
  return { mode: "auto", reason: null };
}

/**
 * Whether the floating "update available" window should open for a version.
 * A version the user skipped stays skipped across restarts; the 4-hourly
 * re-check must not resurrect it. A newer version than the skipped one is
 * shown again.
 */
function shouldShowUpdateNotification({ version, skippedVersion }) {
  if (!version) return false;
  if (!skippedVersion) return true;
  return String(version).trim() !== String(skippedVersion).trim();
}

function releasePageUrl(version) {
  const v = typeof version === "string" ? version.trim().replace(/^v/, "") : "";
  return v ? `${RELEASES_BASE}/tag/v${encodeURIComponent(v)}` : `${RELEASES_BASE}/latest`;
}

module.exports = { resolveUpdateMode, shouldShowUpdateNotification, releasePageUrl };
