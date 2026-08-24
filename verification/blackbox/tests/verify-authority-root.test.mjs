import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const workspace = resolve(import.meta.dirname, "../../..");
const verifier = resolve(
  workspace,
  "verification/blackbox/verify-authority-root.mjs",
);
const scratchRoot = resolve(workspace, "verification/blackbox/tests");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture(entryPath) {
  const directory = await mkdtemp(resolve(scratchRoot, "tmp-authority-"));
  const relativeDirectory = directory.slice(workspace.length + 1);
  const payloadPath = resolve(directory, "payload.txt");
  const payload = Buffer.from("authority fixture\n");
  await writeFile(payloadPath, payload);
  const entries = Array.isArray(entryPath) ? entryPath : [entryPath];
  const root = Buffer.from(
    `# Authority fixture\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: "rvs-authority-root-v1", entries: entries.map((path) => ({ path, bytes: payload.length, sha256: sha256(payload) })) })}\n\`\`\`\n`,
  );
  const rootPath = resolve(directory, "root.md");
  await writeFile(rootPath, root);
  return { directory, relativeDirectory, rootPath, expected: sha256(root) };
}

function run(root, expected) {
  return spawnSync(
    process.execPath,
    [verifier, "--root", root, "--expected", expected],
    {
      cwd: workspace,
      encoding: "utf8",
    },
  );
}

async function rejects(name, entryPath, expectedDetail) {
  await test(name, async () => {
    // Given
    const created = await fixture(entryPath);
    try {
      // When
      const result = run(
        `${created.relativeDirectory}/root.md`,
        created.expected,
      );
      // Then
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        new RegExp(`AUTHORITY_ROOT_DRIFT: ${expectedDetail}`),
      );
    } finally {
      await rm(created.directory, { recursive: true, force: true });
    }
  });
}

await test("rejects an absolute authority root", async () => {
  // Given
  const created = await fixture("unused.txt");
  try {
    // When
    const result = run(created.rootPath, created.expected);
    // Then
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /AUTHORITY_ROOT_DRIFT: root path must be workspace-relative/,
    );
  } finally {
    await rm(created.directory, { recursive: true, force: true });
  }
});

await test("rejects an authority root traversal", () => {
  // Given / When
  const result = run("../outside-root.md", "0".repeat(64));
  // Then
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /AUTHORITY_ROOT_DRIFT: root path must stay within workspace/,
  );
});

await test("rejects an in-workspace authority root traversal", async () => {
  // Given
  const created = await fixture("unused.txt");
  const [parent, directory] = created.relativeDirectory.split(/\/(?=[^/]+$)/);
  try {
    // When
    const result = run(
      `${parent}/${directory}/../${directory}/root.md`,
      created.expected,
    );
    // Then
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /AUTHORITY_ROOT_DRIFT: root path must not contain traversal/,
    );
  } finally {
    await rm(created.directory, { recursive: true, force: true });
  }
});

await rejects(
  "rejects an absolute entry",
  "/etc/hosts",
  "entry path must be workspace-relative",
);
await rejects(
  "rejects an entry traversal",
  "../outside.txt",
  "entry path must stay within workspace",
);

await test("rejects an in-workspace entry traversal", async () => {
  // Given
  const created = await fixture([]);
  const entry = `${created.relativeDirectory}/../${created.relativeDirectory.split("/").at(-1)}/payload.txt`;
  const payload = Buffer.from("authority fixture\n");
  const root = Buffer.from(
    `# Authority fixture\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: "rvs-authority-root-v1", entries: [{ path: entry, bytes: payload.length, sha256: sha256(payload) }] })}\n\`\`\`\n`,
  );
  await writeFile(created.rootPath, root);
  try {
    // When
    const result = run(`${created.relativeDirectory}/root.md`, sha256(root));
    // Then
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /AUTHORITY_ROOT_DRIFT: entry path must not contain traversal/,
    );
  } finally {
    await rm(created.directory, { recursive: true, force: true });
  }
});

await test("rejects an entry symlink that escapes the workspace", async () => {
  // Given
  const created = await fixture(`${"PLACEHOLDER"}/outside-link`);
  const entry = `${created.relativeDirectory}/outside-link`;
  await symlink("/etc/hosts", resolve(created.directory, "outside-link"));
  const root = Buffer.from(
    `# Authority fixture\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: "rvs-authority-root-v1", entries: [{ path: entry, bytes: 0, sha256: "0".repeat(64) }] })}\n\`\`\`\n`,
  );
  await writeFile(created.rootPath, root);
  try {
    // When
    const result = run(`${created.relativeDirectory}/root.md`, sha256(root));
    // Then
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /AUTHORITY_ROOT_DRIFT: entry path resolves outside workspace/,
    );
  } finally {
    await rm(created.directory, { recursive: true, force: true });
  }
});

await test("rejects duplicate entries", async () => {
  // Given
  const created = await fixture([]);
  const entry = `${created.relativeDirectory}/payload.txt`;
  const payload = Buffer.from("authority fixture\n");
  const root = Buffer.from(
    `# Authority fixture\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: "rvs-authority-root-v1", entries: [entry, entry].map((path) => ({ path, bytes: payload.length, sha256: sha256(payload) })) })}\n\`\`\`\n`,
  );
  await writeFile(created.rootPath, root);
  try {
    // When
    const result = run(`${created.relativeDirectory}/root.md`, sha256(root));
    // Then
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AUTHORITY_ROOT_DRIFT: duplicate entry path=/);
  } finally {
    await rm(created.directory, { recursive: true, force: true });
  }
});
