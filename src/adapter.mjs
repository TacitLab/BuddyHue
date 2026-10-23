export const workbuddyAdapter = {
  id: "workbuddy",
  displayName: "Tencent WorkBuddy",
  defaultPort: 9336,
  lastVerified: {
    darwin: { appVersion: "5.9.1", build: "5.9.1", verifiedAt: "2026-10-23" },
  },
  platforms: {
    darwin: {
      bundleId: "com.tencent.workbuddy.mac",
      bundleIds: ["com.tencent.workbuddy.mac", "com.workbuddy.workbuddy"],
      appCandidates: ["/Applications/WorkBuddy.app", "~/Applications/WorkBuddy.app"],
      executableRelative: "Contents/MacOS/Electron",
      processMarkers: ["/WorkBuddy.app/Contents/MacOS/Electron"],
    },
    win32: {
      executableCandidates: [
        "%LOCALAPPDATA%\\Programs\\WorkBuddy\\WorkBuddy.exe",
        "%LOCALAPPDATA%\\WorkBuddy\\WorkBuddy.exe",
        "%PROGRAMFILES%\\WorkBuddy\\WorkBuddy.exe"
      ],
      uninstallKeys: ["WorkBuddy"],
      processNames: ["WorkBuddy.exe", "Electron.exe"]
    }
  },
  matchTarget(target) {
    if (target?.type !== "page") return false;
    const url = String(target.url ?? "");
    if (/^(devtools|chrome-extension):/i.test(url)) return false;
    return /workbuddy/i.test(String(target.title ?? ""))
      || /app\.asar\/renderer\/index\.html(?:[#?].*)?$/i.test(url)
      || /^(workbuddy|vscode-file):/i.test(url)
      || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url);
  },
  verification: {
    rootAny: ["#root > .teams-container", ".teams-container", "#root"],
    recommended: [
      { name: "sidebar", any: [".conversation-sidebar", ".conversation-list", "[class*='sidebar']"] },
      { name: "workspace", any: [".teams-main-content", ".main-content", ".chat-container"] },
      { name: "composer", any: ["[role='textbox'][contenteditable='true']", ".wb-home-composer [contenteditable='true']"] }
    ]
  }
};

export function isSupportedVersion(version) {
  return typeof version === "string" && /^5\.9(?:\.|$)/.test(version);
}
