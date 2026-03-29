/**
 * Utility functions for audio device detection and management.
 * Shared between renderer components and audio manager.
 */

/**
 * Determines if a microphone device is a built-in device based on its label.
 * Works across macOS, Windows, and Linux platforms.
 */
export function isBuiltInMicrophone(label: string): boolean {
  const lowerLabel = label.toLowerCase();

  // Direct built-in indicators
  if (
    lowerLabel.includes("built-in") ||
    lowerLabel.includes("internal") ||
    lowerLabel.includes("macbook") ||
    lowerLabel.includes("integrated") ||
    lowerLabel.includes("laptop") ||
    lowerLabel.includes("default") // WhisperWoof: catch "Default" labeled devices
  ) {
    return true;
  }

  // macOS-specific patterns (Apple Silicon Macs)
  if (
    lowerLabel.includes("macbook") ||
    lowerLabel.includes("imac") ||
    lowerLabel.includes("mac mini") ||
    lowerLabel.includes("mac studio") ||
    lowerLabel.includes("mac pro")
  ) {
    return true;
  }

  // Generic "microphone" without external device indicators
  if (lowerLabel.includes("microphone") || lowerLabel.includes("mic")) {
    const externalIndicators = [
      "bluetooth",
      "airpods",
      "wireless",
      "usb",
      "external",
      "headset",
      "webcam",
      "iphone",
      "ipad",
      "beats",
      "jabra",
      "logitech",
      "blue yeti",
      "rode",
      "audio-technica",
      "samsung",
      "sony",
    ];
    return !externalIndicators.some((indicator) => lowerLabel.includes(indicator));
  }

  return false;
}
