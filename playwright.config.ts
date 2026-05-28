import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

type NextDevLock = {
  appUrl?: string;
  hostname?: string;
  pid?: number;
  port?: number;
};

function normalizeLoopbackURL(url: string) {
  const parsed = new URL(url);

  if (parsed.hostname === "localhost" || parsed.hostname === "::1") {
    parsed.hostname = "127.0.0.1";
  }

  return parsed.toString().replace(/\/$/, "");
}

function getExistingNextDevURL() {
  if (process.env.CI || process.env.E2E_PORT || !existsSync(".next/dev/lock")) {
    return undefined;
  }

  try {
    const lock = JSON.parse(readFileSync(".next/dev/lock", "utf8")) as NextDevLock;

    if (typeof lock.pid === "number") {
      process.kill(lock.pid, 0);
    }

    if (lock.appUrl) {
      return normalizeLoopbackURL(lock.appUrl);
    }

    if (typeof lock.port === "number") {
      const hostname =
        !lock.hostname || lock.hostname === "localhost" || lock.hostname === "::1"
          ? "127.0.0.1"
          : lock.hostname;

      return `http://${hostname}:${lock.port}`;
    }
  } catch {
    return undefined;
  }
}

const e2ePort = process.env.E2E_PORT ?? "3100";
const existingNextDevURL = getExistingNextDevURL();
const baseURL = existingNextDevURL ?? `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: existingNextDevURL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
        url: baseURL,
        reuseExistingServer: Boolean(process.env.E2E_PORT) && !process.env.CI,
        timeout: 120_000
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
