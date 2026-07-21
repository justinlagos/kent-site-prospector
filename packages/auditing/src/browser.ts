import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";

/**
 * Launch headless Chromium robustly.
 * Order: KSP_CHROMIUM_EXECUTABLE env override → Playwright's managed browser →
 * a system chromium at common paths (covers environments with a pre-provisioned browser
 * that doesn't match the installed Playwright revision).
 */
const FALLBACK_PATHS = [
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

export async function launchBrowser(): Promise<Browser> {
  const override = process.env.KSP_CHROMIUM_EXECUTABLE;
  if (override && existsSync(override)) {
    return chromium.launch({ headless: true, executablePath: override });
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    for (const candidate of FALLBACK_PATHS) {
      if (existsSync(candidate)) {
        return chromium.launch({ headless: true, executablePath: candidate });
      }
    }
    throw err;
  }
}
