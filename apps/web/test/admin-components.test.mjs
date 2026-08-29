import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const shell = readFileSync(
  resolve(root, "apps/web/src/components/Shells.tsx"),
  "utf8",
);
const routes = readFileSync(
  resolve(root, "apps/web/src/app/[locale]/[...slug]/page.tsx"),
  "utf8",
);
const messages = JSON.parse(
  readFileSync(resolve(root, "apps/web/messages/en-US.json"), "utf8"),
);
const exportButton = readFileSync(
  resolve(root, "apps/web/src/components/AdminExportButton.tsx"),
  "utf8",
);
const jobCancelButton = readFileSync(
  resolve(root, "apps/web/src/components/AdminJobCancelButton.tsx"),
  "utf8",
);
const jobRetryButton = readFileSync(
  resolve(root, "apps/web/src/components/AdminJobRetryButton.tsx"),
  "utf8",
);
const quarantineReleaseButton = readFileSync(
  resolve(root, "apps/web/src/components/AdminQuarantineReleaseButton.tsx"),
  "utf8",
);
const quarantineRejectButton = readFileSync(
  resolve(root, "apps/web/src/components/AdminQuarantineRejectButton.tsx"),
  "utf8",
);
const jobForceTerminateButton = readFileSync(
  resolve(root, "apps/web/src/components/AdminJobForceTerminateButton.tsx"),
  "utf8",
);
const aiProviderSettingsForm = readFileSync(
  resolve(root, "apps/web/src/components/AiProviderSettingsForm.tsx"),
  "utf8",
);
const authProxy = readFileSync(
  resolve(root, "apps/web/src/app/api/auth-proxy.ts"),
  "utf8",
);
const primitivesCss = readFileSync(
  resolve(root, "apps/web/src/styles/primitives.css"),
  "utf8",
);

describe("admin surface contracts", () => {
  it("uses live API-backed surfaces instead of static admin screens", () => {
    expect(routes).toContain('liveApiGet("/admin/tenants")');
    expect(messages.AdminSlug.noJobsMatch).toBe(
      "No compiler jobs match these filters.",
    );
    for (const landmark of [
      'data-landmark="filters"',
      'data-landmark="pagination"',
      'data-landmark="timeline-list"',
      'detailLandmark="detail-drawer"',
    ])
      expect(routes).toContain(landmark);
    expect(routes).not.toContain(
      "No live records are connected for this page.",
    );
    for (const name of [
      "AdminDashboard",
      "JobQueue",
      "TenantDirectory",
      "ReceiptChain",
      "QuarantineReview",
      "AuditLog",
    ])
      expect(routes).not.toContain(name);
  });
  it("keeps shell destinations bounded and narrow-menu capable", () => {
    expect(shell).toContain('href: "/admin/jobs"');
    expect(shell).toContain('aria-controls="admin-navigation"');
    expect(shell).toContain('href="/projects/new"');
  });
  it("keeps admin and creator job detail contracts separate", () => {
    const adminDetails = routes.match(
      /const adminJobDetails[\s\S]*?\n\];/u,
    )?.[0];
    expect(adminDetails).toBeDefined();
    expect(adminDetails).toContain('field(row, "creatorId")');
    expect(adminDetails).not.toMatch(/preparationStage|updatedAt/u);
    expect(routes).toContain("details={adminJobDetails(t)}");
    expect(routes).toContain("details={creatorJobDetails(t)}");
  });
  it("shows live motion backend, verification, version, and deliverables on admin jobs", () => {
    expect(routes).toContain('field(row, "motion")');
    expect(routes).toContain('name="backend"');
    expect(routes).toContain('name="verification"');
    for (const key of [
      "motionBackend",
      "sceneVersion",
      "verification",
      "verificationAttempts",
      "verificationFindings",
      "capabilities",
      "deliverables",
    ])
      expect(messages.AdminSlug.fields[key]).toBeTruthy();
  });
  it("keeps the motion job table readable at tablet and mobile widths", () => {
    expect(routes).toContain('tableClassName="admin-job-motion-table"');
    expect(primitivesCss).toContain(".admin-job-motion-table");
    expect(primitivesCss).toContain(".admin-job-secondary");
    expect(primitivesCss).toContain(".admin-job-backend");
  });
  it("uses the HTTP-compatible request ID helper for exports", () => {
    expect(exportButton).toContain("requestId()");
    expect(exportButton).not.toContain("crypto.randomUUID()");
  });
  it("wires job cancel/retry/force-terminate and quarantine release/reject with If-Match", () => {
    for (const [file, path] of [
      [jobCancelButton, "/cancel"],
      [jobRetryButton, "/retry"],
      [jobForceTerminateButton, "/force-terminate"],
      [quarantineReleaseButton, "/release"],
      [quarantineRejectButton, "/reject"],
    ]) {
      expect(file).toContain(path);
      expect(file).toContain('"if-match": ');
      expect(file).toContain("requestId()");
    }
    expect(routes).toContain("detailActions={adminJobDetailActions(t)}");
    expect(routes).toContain("detailActions={quarantineDetailActions}");
    // Cancel/retry buttons must never render for the creator-facing
    // Workflow page — only the admin Jobs table gets them.
    expect(routes).toContain("detailActions={jobDetailActions(t)}");
  });
  it("adds an AI Settings destination and never renders a plaintext key", () => {
    expect(shell).toContain('href: "/admin/ai-settings"');
    expect(routes).toContain('"admin/ai-settings"');
    expect(routes).toContain("renderAiSettings");
    // Only a write-only password input and a boolean "Configured"/"Not set"
    // summary -- the previous key value must never be echoed back.
    expect(aiProviderSettingsForm).toContain('type="password"');
    // The api key field starts empty -- never seeded from a server prop --
    // and the server-provided `hasApiKey` boolean is the only signal shown.
    expect(aiProviderSettingsForm).toContain('useState("")');
    expect(aiProviderSettingsForm).toContain("hasApiKey");
    expect(aiProviderSettingsForm).not.toMatch(/apiKey:\s*string;/u);
    // The browser BFF proxy must explicitly allow this PATCH route through,
    // same as every other admin mutation -- easy to add the backend route
    // and forget this half, which 404s the form silently.
    expect(authProxy).toContain('["PATCH", ["ai-provider-settings"]]');
  });
  it("forwards the attachment filename header through the /v1 proxy", () => {
    // Job attachment uploads set x-filename; the proxy's header allowlist
    // silently drops anything not listed here, which previously made every
    // uploaded attachment land server-side as the generic "attachment".
    expect(authProxy).toContain('"x-filename"');
  });
});
