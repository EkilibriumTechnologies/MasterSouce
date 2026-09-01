import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const VIEWPORTS = [320, 375, 390, 393, 414, 430, 1024, 1280];
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
        innerWidth: window.innerWidth
      })`,
      returnByValue: true
    });
    results.push(JSON.parse(evaluation.result.value));
  }

  console.table(
    results.map((result) => ({
      Viewport: result.viewport,
      clientWidth: result.clientWidth,
      "html scrollWidth": result.htmlScrollWidth,
      "body scrollWidth": result.bodyScrollWidth,
      innerWidth: result.innerWidth,
      Result:
        result.htmlScrollWidth <= result.clientWidth + 0.99 &&
        result.bodyScrollWidth <= result.innerWidth + 0.99
          ? "PASS"
          : "FAIL"
    }))
  );

  const failures = results.filter(
    (result) =>
      result.htmlScrollWidth > result.clientWidth + 0.99 ||
      result.bodyScrollWidth > result.innerWidth + 0.99
  );
  if (failures.length > 0) {
    throw new Error(`Homepage horizontal overflow detected at: ${failures.map((item) => item.viewport).join(", ")}px`);
  }
} finally {
  client?.close();
  chromeProcess?.kill("SIGTERM");
  appProcess?.kill("SIGTERM");
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
