/**
 * Binary Check — Auto-detect and download missing whisper-server binary
 *
 * Runs on app startup. If the whisper-server binary is missing, downloads
 * it automatically from GitHub releases with a progress notification.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const https = require("https");
const { createWriteStream } = require("fs");
const { exec } = require("child_process");
const debugLogger = require("../../helpers/debugLogger");

const WHISPER_CPP_REPO = "OpenWhispr/whisper.cpp";

function getExpectedBinaryPath() {
  const platform = process.platform;
  const arch = process.arch;
  const binaryName = platform === "win32"
    ? `whisper-server-${platform}-${arch}.exe`
    : `whisper-server-${platform}-${arch}`;

  // Check all candidate locations
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "bin", binaryName));
  }
  candidates.push(path.join(__dirname, "..", "..", "..", "resources", "bin", binaryName));

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Return the dev location (where we'd download to)
  return path.join(__dirname, "..", "..", "..", "resources", "bin", binaryName);
}

function isBinaryAvailable() {
  const binaryPath = getExpectedBinaryPath();
  return fs.existsSync(binaryPath);
}

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "WhisperWoof",
        "Accept": "application/vnd.github.v3+json",
      },
    };
    // Add GitHub token if available
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) options.headers["Authorization"] = `token ${token}`;

    https.get(url, options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse JSON: ${e.message}`)); }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function downloadToFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "WhisperWoof",
      "Accept": "application/octet-stream",
    };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers["Authorization"] = `token ${token}`;

    const doRequest = (reqUrl) => {
      https.get(reqUrl, { headers }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return doRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0");
        let downloaded = 0;
        const file = createWriteStream(destPath);

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (onProgress && totalBytes > 0) {
            onProgress(downloaded, totalBytes);
          }
        });
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
        res.on("error", reject);
      }).on("error", reject);
    };

    doRequest(url);
  });
}

async function autoDownloadWhisperServer(onStatus) {
  const platform = process.platform;
  const arch = process.arch;
  const platformArch = `${platform}-${arch}`;

  const zipNames = {
    "darwin-arm64": "whisper-server-darwin-arm64.zip",
    "darwin-x64": "whisper-server-darwin-x64.zip",
    "win32-x64": "whisper-server-win32-x64-cpu.zip",
    "linux-x64": "whisper-server-linux-x64-cpu.zip",
  };

  const binaryNames = {
    "darwin-arm64": "whisper-server-darwin-arm64",
    "darwin-x64": "whisper-server-darwin-x64",
    "win32-x64": "whisper-server-win32-x64-cpu.exe",
    "linux-x64": "whisper-server-linux-x64-cpu",
  };

  const zipName = zipNames[platformArch];
  const extractBinaryName = binaryNames[platformArch];
  if (!zipName) {
    debugLogger.log(`[BinaryCheck] Unsupported platform: ${platformArch}`);
    return false;
  }

  onStatus?.("Finding latest release...");

  try {
    // Fetch latest release
    const release = await fetchJSON(`https://api.github.com/repos/${WHISPER_CPP_REPO}/releases/latest`);
    const asset = release?.assets?.find((a) => a.name === zipName);
    if (!asset) {
      debugLogger.log(`[BinaryCheck] Asset ${zipName} not found in release ${release?.tag_name}`);
      return false;
    }

    const binDir = path.join(__dirname, "..", "..", "..", "resources", "bin");
    fs.mkdirSync(binDir, { recursive: true });

    const zipPath = path.join(binDir, zipName);
    const outputName = platform === "win32"
      ? `whisper-server-${platformArch}.exe`
      : `whisper-server-${platformArch}`;
    const outputPath = path.join(binDir, outputName);

    // Download
    onStatus?.("Downloading whisper-server...");
    await downloadToFile(asset.url, zipPath, (downloaded, total) => {
      const pct = Math.round((downloaded / total) * 100);
      onStatus?.(`Downloading whisper-server... ${pct}%`);
    });

    // Extract
    onStatus?.("Extracting...");
    const extractDir = path.join(binDir, `temp-whisper-extract`);
    fs.mkdirSync(extractDir, { recursive: true });

    await new Promise((resolve, reject) => {
      exec(`unzip -o "${zipPath}" -d "${extractDir}"`, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    // Find and move binary
    const findBinary = (dir, name) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === name) return full;
        if (entry.isDirectory()) {
          const found = findBinary(full, name);
          if (found) return found;
        }
      }
      return null;
    };

    const binaryPath = findBinary(extractDir, extractBinaryName);
    if (binaryPath) {
      fs.copyFileSync(binaryPath, outputPath);
      fs.chmodSync(outputPath, 0o755);
      debugLogger.log(`[BinaryCheck] whisper-server downloaded to ${outputPath}`);
    } else {
      debugLogger.log(`[BinaryCheck] Binary not found in archive`);
      return false;
    }

    // Cleanup
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
      fs.unlinkSync(zipPath);
    } catch { /* */ }

    onStatus?.("Ready!");
    return true;

  } catch (error) {
    debugLogger.log(`[BinaryCheck] Download failed: ${error.message}`);
    onStatus?.(`Download failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  isBinaryAvailable,
  autoDownloadWhisperServer,
};
