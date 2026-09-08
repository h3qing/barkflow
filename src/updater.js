const path = require("path");
const { autoUpdater } = require("electron-updater");
const {
  resolveUpdateMode,
  shouldShowUpdateNotification,
  releasePageUrl,
} = require("./whisperwoof/bridge/update-policy-pure");

/**
 * The build stamps how it wants to be updated into the packaged package.json
 * (electron-builder --config.extraMetadata.whisperwoofUpdateMode=off|manual).
 * See update-policy-pure.js for what each mode means.
 */
function readPackagedUpdateMode() {
  try {
    const { app } = require("electron");
    const pkg = require(path.join(app.getAppPath(), "package.json"));
    return pkg?.whisperwoofUpdateMode;
  } catch {
    return undefined;
  }
}

class UpdateManager {
  constructor() {
    this.mainWindow = null;
    this.controlPanelWindow = null;
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.lastUpdateInfo = null;
    this.isInstalling = false;
    this.isDownloading = false;
    this.eventListeners = [];
    this.updateCheckInterval = null;
    this.windowManager = null;
    this._suppressNotification = false;
    // True while a check/download the USER started is in flight — only
    // those errors are worth a dialog in the renderer.
    this._userInitiated = false;
    // Persisted "skip this version" lives with the other user preferences
    // (environment.js); injected by main.js so this module stays testable.
    this._preferences = null;

    const { mode, reason } = resolveUpdateMode({
      nodeEnv: process.env.NODE_ENV,
      packageMode: readPackagedUpdateMode(),
    });
    this.updateMode = mode;
    this.disabledReason = reason;
    if (mode === "off") {
      console.log(`🔕 Update checks disabled (${reason})`);
    }

    this.setupAutoUpdater();
  }

  setWindows(mainWindow, controlPanelWindow) {
    this.mainWindow = mainWindow;
    this.controlPanelWindow = controlPanelWindow;
  }

  setWindowManager(windowManager) {
    this.windowManager = windowManager;
  }

  /** @param {{getSkippedVersion: () => string, saveSkippedVersion: (v: string) => void}} prefs */
  setPreferences(prefs) {
    this._preferences = prefs;
  }

  isDisabled() {
    return this.updateMode === "off";
  }

  setupAutoUpdater() {
    if (this.isDisabled()) {
      return;
    }

    // Feed MUST match electron-builder.json "publish" — this fork inherited
    // upstream's coordinates here, so every installed copy was checking
    // OpenWhispr's releases and could offer to "update" WhisperWoof into a
    // different product entirely.
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "h3qing",
      repo: "whisperwoof",
      private: false,
    });

    // Use arch-specific update channel on macOS to prevent arm64/x64
    // from downloading mismatched artifacts. Both builds publish to the
    // same GitHub release, so without this they race on latest-mac.yml.
    // Setting channel to e.g. 'latest-arm64' makes the updater look for
    // 'latest-arm64-mac.yml' instead of the shared 'latest-mac.yml'.
    if (process.platform === "darwin") {
      let nativeArch = process.arch;

      // Detect Rosetta: if an x64 build is running on Apple Silicon,
      // sysctl.proc_translated returns "1". This self-heals users who
      // got stuck on the x64 build from older releases.
      if (process.arch === "x64") {
        try {
          const { execSync } = require("child_process");
          const translated = execSync("sysctl -n sysctl.proc_translated", {
            encoding: "utf8",
            timeout: 3000,
          }).trim();
          if (translated === "1") {
            console.log("🔄 Rosetta detected — switching update channel to arm64");
            nativeArch = "arm64";
          }
        } catch {
          // sysctl.proc_translated doesn't exist on real Intel Macs — ignore
        }
      }

      autoUpdater.channel = nativeArch === "arm64" ? "latest-arm64" : "latest-x64";
      // electron-updater's channel setter silently flips allowDowngrade on,
      // which makes ANY version that differs from the running one an
      // "update" — a build ahead of the latest release would be nagged to
      // go backwards. The channel is only here for the per-arch yml name.
      autoUpdater.allowDowngrade = false;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const handlers = {
      "checking-for-update": () => {
        this.notifyRenderers("checking-for-update");
      },
      "update-available": (info) => {
        this.updateAvailable = true;
        if (info) {
          this.lastUpdateInfo = {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes,
            files: info.files,
          };
        }
        this.notifyRenderers("update-available", info);
        const skippedVersion = this._preferences?.getSkippedVersion?.() || "";
        const show = shouldShowUpdateNotification({ version: info?.version, skippedVersion });
        if (!show && info?.version) {
          console.log(`🔕 Update ${info.version} was skipped by the user — not prompting`);
        }
        if (this.windowManager && info && show && !this._suppressNotification) {
          this.windowManager
            .showUpdateNotification({ ...info, manual: this.updateMode === "manual" })
            .catch((err) => {
              console.error("Failed to show update notification:", err);
            });
        }
        this._suppressNotification = false;
      },
      "update-not-available": (info) => {
        this.updateAvailable = false;
        this._suppressNotification = false;
        if (!this.updateDownloaded) {
          this.isDownloading = false;
          this.lastUpdateInfo = null;
        }
        this.notifyRenderers("update-not-available", info);
      },
      error: (err) => {
        console.error("❌ Auto-updater error:", err);
        this._suppressNotification = false;
        this.isDownloading = false;
        // A failed BACKGROUND check (offline, a release without a channel
        // yml, GitHub down) is a log line, not a modal: the renderer turns
        // update-error into an alert every time Settings mounts. Errors
        // from something the user clicked still surface.
        if (this._userInitiated) {
          this.notifyRenderers("update-error", err);
        }
      },
      "download-progress": (progressObj) => {
        console.log(
          `📥 Download progress: ${progressObj.percent.toFixed(2)}% (${(progressObj.transferred / 1024 / 1024).toFixed(2)}MB / ${(progressObj.total / 1024 / 1024).toFixed(2)}MB)`
        );
        this.notifyRenderers("update-download-progress", progressObj);
      },
      "update-downloaded": (info) => {
        console.log("✅ Update downloaded successfully:", info?.version);
        this.updateDownloaded = true;
        this.isDownloading = false;
        this._userInitiated = false;
        if (info) {
          this.lastUpdateInfo = {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes,
            files: info.files,
          };
        }
        this.notifyRenderers("update-downloaded", info);
      },
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      autoUpdater.on(event, handler);
      this.eventListeners.push({ event, handler });
    });
  }

  notifyRenderers(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
    if (
      this.controlPanelWindow &&
      !this.controlPanelWindow.isDestroyed() &&
      this.controlPanelWindow.webContents
    ) {
      this.controlPanelWindow.webContents.send(channel, data);
    }
  }

  async checkForUpdates() {
    try {
      if (this.isDisabled()) {
        return {
          updateAvailable: false,
          updatesDisabled: true,
          reason: this.disabledReason,
          message:
            this.disabledReason === "development"
              ? "Update checks are disabled in development mode"
              : "This is a local build — update checks are off. Pull and rebuild to update.",
        };
      }

      console.log("🔍 Checking for updates...");
      this._suppressNotification = true;
      this._userInitiated = true;
      const result = await autoUpdater.checkForUpdates().finally(() => {
        this._userInitiated = false;
      });

      if (result?.isUpdateAvailable && result?.updateInfo) {
        console.log("📋 Update available:", result.updateInfo.version);
        return {
          updateAvailable: true,
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
          files: result.updateInfo.files,
          releaseNotes: result.updateInfo.releaseNotes,
        };
      } else {
        console.log("✅ Already on latest version");
        return {
          updateAvailable: false,
          message: "You are running the latest version",
        };
      }
    } catch (error) {
      console.error("❌ Update check error:", error);
      throw error;
    }
  }

  async downloadUpdate() {
    try {
      if (this.isDisabled()) {
        return {
          success: false,
          message:
            this.disabledReason === "development"
              ? "Update downloads are disabled in development mode"
              : "This is a local build — update downloads are off",
        };
      }

      if (this.updateMode === "manual") {
        // Unsigned build: Squirrel cannot install it, so the honest action is
        // to open the release page and let the user drag the new DMG in.
        const { shell } = require("electron");
        const url = releasePageUrl(this.lastUpdateInfo?.version);
        console.log("🌐 Manual update mode — opening release page:", url);
        await shell.openExternal(url);
        return { success: true, manual: true, url, message: "Opened the release page" };
      }

      if (this.isDownloading) {
        return {
          success: true,
          message: "Download already in progress",
        };
      }

      if (this.updateDownloaded) {
        return {
          success: true,
          message: "Update already downloaded. Ready to install.",
        };
      }

      this.isDownloading = true;
      this._userInitiated = true;
      console.log("📥 Starting update download...");
      await autoUpdater.downloadUpdate();
      console.log("📥 Download initiated successfully");

      return { success: true, message: "Update download started" };
    } catch (error) {
      this.isDownloading = false;
      this._userInitiated = false;
      console.error("❌ Update download error:", error);
      throw error;
    }
  }

  /** Persist "don't prompt me again for this version" and close the prompt. */
  skipCurrentVersion() {
    const version = this.lastUpdateInfo?.version;
    if (!version) return { success: false, message: "No update to skip" };
    try {
      this._preferences?.saveSkippedVersion?.(version);
      console.log(`🔕 Skipping update ${version} until a newer one appears`);
      return { success: true, version };
    } catch (error) {
      console.error("❌ Failed to persist skipped update version:", error);
      return { success: false, message: error.message };
    }
  }

  async installUpdate() {
    try {
      if (this.isDisabled() || this.updateMode === "manual") {
        return {
          success: false,
          message:
            this.updateMode === "manual"
              ? "This build installs updates manually from the release page"
              : "Update installation is disabled for this build",
        };
      }

      if (!this.updateDownloaded) {
        return {
          success: false,
          message: "No update available to install",
        };
      }

      if (this.isInstalling) {
        return {
          success: false,
          message: "Update installation already in progress",
        };
      }

      this.isInstalling = true;
      console.log("🔄 Installing update and restarting...");

      const { app, BrowserWindow } = require("electron");

      // Set windowManager.isQuitting before removing close listeners
      app.emit("before-quit");
      app.removeAllListeners("window-all-closed");
      BrowserWindow.getAllWindows().forEach((win) => {
        win.removeAllListeners("close");
      });

      const isSilent = process.platform === "win32";
      autoUpdater.quitAndInstall(isSilent, true);

      return { success: true, message: "Update installation started" };
    } catch (error) {
      this.isInstalling = false;
      console.error("❌ Update installation error:", error);
      throw error;
    }
  }

  async getAppVersion() {
    try {
      const { app } = require("electron");
      return { version: app.getVersion() };
    } catch (error) {
      console.error("❌ Error getting app version:", error);
      throw error;
    }
  }

  async getUpdateStatus() {
    try {
      return {
        updateAvailable: this.updateAvailable,
        updateDownloaded: this.updateDownloaded,
        isDevelopment: process.env.NODE_ENV === "development",
        updateMode: this.updateMode,
        updatesDisabled: this.isDisabled(),
        disabledReason: this.disabledReason,
      };
    } catch (error) {
      console.error("❌ Error getting update status:", error);
      throw error;
    }
  }

  async getUpdateInfo() {
    try {
      return this.lastUpdateInfo;
    } catch (error) {
      console.error("❌ Error getting update info:", error);
      throw error;
    }
  }

  checkForUpdatesOnStartup() {
    if (!this.isDisabled()) {
      setTimeout(() => {
        console.log("🔄 Checking for updates on startup...");
        autoUpdater.checkForUpdates().catch((err) => {
          console.error("Startup update check failed:", err);
        });
      }, 3000);

      const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
      this.updateCheckInterval = setInterval(() => {
        console.log("🔄 Periodic update check...");
        autoUpdater.checkForUpdates().catch((err) => {
          console.error("Periodic update check failed:", err);
        });
      }, FOUR_HOURS_MS);
    }
  }

  cleanup() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
    this.eventListeners.forEach(({ event, handler }) => {
      autoUpdater.removeListener(event, handler);
    });
    this.eventListeners = [];
  }
}

module.exports = UpdateManager;
