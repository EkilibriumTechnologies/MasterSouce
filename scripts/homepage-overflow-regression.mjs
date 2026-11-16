import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const VIEWPORTS = [320, 360, 375, 390, 393, 414, 430, 768, 1024, 1280];
const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("Could not allocate a local port."))));
    });
  });
}

async function waitForHttp(url, label, attempts = 120) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${label} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready: ${lastError?.message ?? "unknown error"}`);
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known Chrome/Chromium location.
    }
  }

  throw new Error("Chrome or Chromium is required. Set CHROME_PATH to its executable.");
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 0;

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  return {
    opened,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    }
  };
}

async function waitForPage(client) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const evaluation = await client.send("Runtime.evaluate", {
      expression: 'document.readyState === "complete" && Boolean(document.querySelector("main"))',
      returnByValue: true
    });
    if (evaluation.result.value === true) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Homepage did not finish rendering.");
}

let appProcess;
let chromeProcess;
let profileDirectory;
let client;

try {
  const suppliedBaseUrl = process.env.HOME_OVERFLOW_BASE_URL;
  const appPort = suppliedBaseUrl ? null : await getAvailablePort();
  const baseUrl = suppliedBaseUrl ?? `http://127.0.0.1:${appPort}`;

  if (!suppliedBaseUrl) {
    appProcess = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(appPort)],
      {
        cwd: process.cwd(),
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    await waitForHttp(baseUrl, "Next.js development server");
  }

  const chromePath = await findChrome();
  const debuggingPort = await getAvailablePort();
  profileDirectory = await mkdtemp(join(tmpdir(), "mastersauce-overflow-"));
  chromeProcess = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${profileDirectory}`,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  await waitForHttp(`http://127.0.0.1:${debuggingPort}/json/version`, "Chrome debugger");
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  const pageTarget = targets.find((target) => target.type === "page");
  if (!pageTarget) throw new Error("Chrome did not expose a page target.");

  client = createCdpClient(pageTarget.webSocketDebuggerUrl);
  await client.opened;
  await client.send("Page.enable");
  await client.send("Network.enable");

  const results = [];
  for (const width of VIEWPORTS) {
    const mobile = width <= 430;
    await client.send("Network.setUserAgentOverride", {
      userAgent: mobile ? IPHONE_USER_AGENT : DESKTOP_USER_AGENT
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: 844
    });
    await client.send("Page.navigate", { url: `${baseUrl}/?overflow-test-width=${width}` });
    await waitForPage(client);

    const evaluation = await client.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        viewport: ${width},
        clientWidth: document.documentElement.clientWidth,
        htmlScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
        viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
        undersizedNavLinks: Array.from(document.querySelectorAll(".home-nav-links a"))
          .filter((link) => link.getBoundingClientRect().height < 43).length,
        visibleElements: Object.fromEntries(
          ["main", 'nav[aria-label="Primary"]', ".home-hero", ".home-hero h1", ".home-hero-ctas", "#master", "#pricing"]
            .map((selector) => {
              const element = document.querySelector(selector);
              if (!element) return [selector, null];
              const rect = element.getBoundingClientRect();
              return [selector, { left: Math.round(rect.left * 10) / 10, right: Math.round(rect.right * 10) / 10 }];
            })
        )
      })`,
      returnByValue: true
    });
    results.push(JSON.parse(evaluation.result.value));
  }

  const inspect = (result) => {
    const violations = [];
    // A page can appear desktop-sized on an iPhone even when scrollWidth === clientWidth.
    if (Math.abs(result.innerWidth - result.viewport) > 1) {
      violations.push(`layout viewport ${result.innerWidth}px != device ${result.viewport}px`);
    }
    if (result.viewport <= 430 && result.undersizedNavLinks > 0) {
      violations.push(`${result.undersizedNavLinks} navigation links below 44px tap height`);
    }
    if (!result.viewportMeta.includes("width=device-width")) {
      violations.push("missing device-width viewport metadata");
    }
    if (result.htmlScrollWidth > result.clientWidth + 1 || result.bodyScrollWidth > result.innerWidth + 1) {
      violations.push(`document overflow (html=${result.htmlScrollWidth}, body=${result.bodyScrollWidth})`);
    }
    for (const [selector, bounds] of Object.entries(result.visibleElements)) {
      if (!bounds) {
        violations.push(`missing ${selector}`);
        continue;
      }
      // The primary UX surfaces must be fully visible without horizontal scrolling.
      if (bounds.left < -1 || bounds.right > result.viewport + 1) {
        violations.push(`${selector} clipped [${bounds.left}, ${bounds.right}]`);
      }
    }
    return violations;
  };
  const failures = results.map((result) => ({ viewport: result.viewport, violations: inspect(result) }))
    .filter((result) => result.violations.length > 0);

  console.table(results.map((result) => ({
    viewport: result.viewport,
    innerWidth: result.innerWidth,
    htmlScrollWidth: result.htmlScrollWidth,
    bodyScrollWidth: result.bodyScrollWidth,
    result: inspect(result).length === 0 ? "PASS" : "FAIL"
  })));

  if (failures.length > 0) {
    throw new Error(`Homepage mobile layout failures:\n${failures.map((item) =>
      `${item.viewport}px: ${item.violations.join("; ")}`).join("\n")}`);
  }
} finally {
  client?.close();
  chromeProcess?.kill("SIGTERM");
  appProcess?.kill("SIGTERM");
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
