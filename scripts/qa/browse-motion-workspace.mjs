// P7.3 `$browse` no-sandbox manual-QA driver.
//
// Given a running production Next server (SITE) fed by the committed motion
// fixture API (apps/web/test/motion-workspace-browser-server.mjs), this drives
// Playwright Chromium with --no-sandbox across the EN/KO viewport matrix,
// asserts the workspace renders once with no horizontal overflow and no console
// errors, runs the desktop/mobile keyboard smokes, and writes screenshots,
// matrix.json, SHA256SUMS, and REPORT.md under OUT.
//
// Env:
//   SITE     production Next base URL (e.g. http://127.0.0.1:3101)
//   JOB_ID   completed motion job id printed by the fixture server
//   OUT      evidence output directory
//   SESSION  session cookie value (default motion-browser-session)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.SITE ?? "http://127.0.0.1:3101";
const JOB_ID = process.env.JOB_ID;
const OUT = process.env.OUT ?? ".omo/evidence/motion-complete-browse-adhoc";
const SESSION = process.env.SESSION ?? "motion-browser-session";
const REPO = process.env.REPO ?? process.cwd();
if (!JOB_ID) throw new Error("JOB_ID is required");

mkdirSync(OUT, { recursive: true });

const LOCALES = ["en-US", "ko-KR"];
const WIDTHS = [1440, 1280, 768, 390, 375, 320];

const git = (args) => execSync(`git ${args}`, { cwd: REPO }).toString().trim();
const rootSha = git("rev-parse HEAD");
const workerSha = git("ls-files -s apps/worker").split(/\s+/)[1];
const adobeSha = git("ls-files -s integrations/adobe-bridge").split(/\s+/)[1];

// Playwright is a dependency of @rvs/web; resolve it from that workspace.
const requireFromWeb = createRequire(join(REPO, "apps/web/package.json"));
const playwright = await import(
  pathToFileURL(requireFromWeb.resolve("@playwright/test")).href
);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error("could not load Playwright chromium");

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const matrix = [];
let keyboardDesktop = null;
let keyboardMobile = null;

try {
  for (const locale of LOCALES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      await context.addCookies([
        { name: "rvs_session", value: SESSION, url: SITE },
      ]);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(String(error)));

      const url = `${SITE}/${locale}/scene-review?jobId=${JOB_ID}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector(".motion-workspace", { timeout: 15000 });

      const measured = await page.evaluate(() => ({
        workspaceCount: document.querySelectorAll(".motion-workspace").length,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        title: document.title,
        bodyPreview: (document.body.innerText || "").slice(0, 220),
      }));

      const file = `${locale}-${width}.png`;
      await page.screenshot({ path: join(OUT, file), fullPage: false });

      matrix.push({
        locale,
        width,
        file,
        url,
        workspaceCount: measured.workspaceCount,
        scrollWidth: measured.scrollWidth,
        innerWidth: measured.innerWidth,
        noHorizontalOverflow: measured.scrollWidth <= measured.innerWidth,
        consoleErrors,
        title: measured.title,
        bodyPreview: measured.bodyPreview,
      });

      // Desktop separator keyboard smoke on EN 1280.
      if (locale === "en-US" && width === 1280) {
        const separator = page.locator('[role="separator"]').first();
        await separator.focus();
        await page.keyboard.press("End");
        keyboardDesktop = {
          viewport: "en-US 1280",
          key: "End",
          ariaValueNow: await separator.getAttribute("aria-valuenow"),
        };
        await page.screenshot({
          path: join(OUT, `${locale}-${width}-keyboard-end.png`),
        });
      }

      // Mobile tab keyboard smoke on KO 320.
      if (locale === "ko-KR" && width === 320) {
        const chatTab = page.locator("#motion-workspace-chat-tab");
        const editorTab = page.locator("#motion-workspace-editor-tab");
        if ((await chatTab.count()) > 0 && (await editorTab.count()) > 0) {
          await chatTab.focus();
          await page.keyboard.press("ArrowRight");
          keyboardMobile = {
            viewport: "ko-KR 320",
            key: "ArrowRight",
            editorSelected: await editorTab.getAttribute("aria-selected"),
          };
          await page.screenshot({
            path: join(OUT, `${locale}-${width}-keyboard-arrow.png`),
          });
        }
      }

      await context.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(OUT, "matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);

const shaLines = readdirSync(OUT)
  .filter((name) => name !== "SHA256SUMS")
  .sort()
  .map((name) => {
    const digest = createHash("sha256")
      .update(readFileSync(join(OUT, name)))
      .digest("hex");
    return `${digest}  ${name}`;
  });
writeFileSync(join(OUT, "SHA256SUMS"), `${shaLines.join("\n")}\n`);

const allWorkspaceOne = matrix.every((row) => row.workspaceCount === 1);
const allNoOverflow = matrix.every((row) => row.noHorizontalOverflow);
const allNoConsole = matrix.every((row) => row.consoleErrors.length === 0);
const pass =
  allWorkspaceOne &&
  allNoOverflow &&
  allNoConsole &&
  keyboardDesktop?.ariaValueNow != null &&
  keyboardMobile?.editorSelected === "true";

const report = `# P7.3 live browse no-sandbox QA

- date: ${new Date().toISOString()}
- root SHA: \`${rootSha}\`
- worker: \`${workerSha}\`
- adobe: \`${adobeSha}\`
- method: Playwright Chromium ${chromium.name?.() ?? ""} with \`--no-sandbox\` (gstack \`$browse\` still NEEDS_SETUP)
- fixture API: \`http://127.0.0.1:3199\` (\`apps/web/test/motion-workspace-browser-server.mjs\`)
- production Next: \`${SITE}\` with \`RVS_INTERNAL_API_URL\`, \`RVS_EXPECTED_ORIGIN=${SITE}\`, \`RVS_INSECURE_COOKIES=true\`
- session: cookie \`rvs_session=${SESSION}\`
- job: \`${JOB_ID}\`

## Matrix

EN/KO x ${WIDTHS.join(" / ")}:

| Check | Result |
| --- | --- |
| \`.motion-workspace\` count | ${allWorkspaceOne ? `1 on all ${matrix.length} viewports` : "FAIL"} |
| \`documentElement.scrollWidth <= innerWidth\` | ${allNoOverflow ? `true on all ${matrix.length}` : "FAIL"} |
| Console errors | ${allNoConsole ? "none" : "FAIL"} |
| Desktop keyboard \`End\` on separator (EN 1280) | \`aria-valuenow=${keyboardDesktop?.ariaValueNow ?? "n/a"}\` |
| Mobile keyboard \`ArrowRight\` Chat->Editor (KO 320) | \`aria-selected=${keyboardMobile?.editorSelected ?? "n/a"}\` |

Artifacts: \`en-US-*.png\`, \`ko-KR-*.png\`, keyboard smokes, \`matrix.json\`, \`SHA256SUMS\`.

## Verdict

**${pass ? "PASS" : "FAIL"}**

- Adobe UI remains capability-locked (P4.8 hardware gate).
`;
writeFileSync(join(OUT, "REPORT.md"), report);

console.log(
  JSON.stringify({
    out: OUT,
    rows: matrix.length,
    pass,
    keyboardDesktop,
    keyboardMobile,
  }),
);
if (!pass) process.exit(1);
