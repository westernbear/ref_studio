import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(import.meta.dirname, "../src/styles/motion-responsive.css"),
  "utf8",
);
const workspaceCss = readFileSync(
  resolve(import.meta.dirname, "../src/styles/motion-workspace.css"),
  "utf8",
);
const editorCss = readFileSync(
  resolve(import.meta.dirname, "../src/styles/motion-editor.css"),
  "utf8",
);
const canvasSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../src/app/[locale]/scene-review/SceneCanvas.tsx",
  ),
  "utf8",
);
const workspaceSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../src/app/[locale]/scene-review/MotionWorkspace.tsx",
  ),
  "utf8",
);
const inspectorSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../src/app/[locale]/scene-review/SceneInspector.tsx",
  ),
  "utf8",
);
const chatSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../src/app/[locale]/scene-review/CompilerChatPanel.tsx",
  ),
  "utf8",
);
const editorSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../src/app/[locale]/scene-review/MotionEditorPanel.tsx",
  ),
  "utf8",
);

describe("motion workspace responsive shell", () => {
  it("keeps the mobile workspace and its Chat/Editor tabs inside the viewport", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(mobile).toMatch(
      /\.motion-workspace-shell \{[^}]*block-size: 100dvb;/su,
    );
    expect(mobile).not.toContain("block-size: auto");
    expect(mobile).not.toContain("min-block-size: calc");
  });

  it("keeps a 44px pointer hit area around the desktop separator", () => {
    expect(workspaceCss).toMatch(
      /\.motion-workspace-separator::before\s*\{[^}]*inline-size:\s*44px/su,
    );
  });

  it("keeps canvas targets keyboard focusable touch-driven and reduced-motion safe", () => {
    expect(editorCss).toMatch(
      /\.scene-canvas-element \{[^}]*min-block-size:\s*44px;[^}]*min-inline-size:\s*44px;/su,
    );
    expect(editorCss).toContain("touch-action: none");
    expect(editorCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(workspaceCss).toContain(":focus-visible");
    expect(canvasSource).toContain("onFocus=");
    expect(canvasSource).toContain("onPointerDown=");
    expect(canvasSource).not.toContain("onMouseOver=");
  });

  it("connects mobile and inspector tabs to their controlled panels", () => {
    expect(workspaceSource).toContain('id="motion-workspace-chat-tab"');
    expect(workspaceSource).toContain('aria-controls="motion-workspace-chat"');
    expect(workspaceSource).toContain('id="motion-workspace-editor-tab"');
    expect(workspaceSource).toContain(
      'aria-controls="motion-workspace-editor"',
    );
    expect(workspaceSource).toContain("onKeyDown={(event) => {");
    expect(chatSource).toContain('role="tabpanel"');
    expect(chatSource).toContain('aria-labelledby="motion-workspace-chat-tab"');
    expect(editorSource).toContain('role="tabpanel"');
    expect(editorSource).toContain(
      'aria-labelledby="motion-workspace-editor-tab"',
    );
    expect(inspectorSource).toContain('id="motion-timeline-tab"');
    expect(inspectorSource).toContain('aria-controls="motion-timeline-panel"');
    expect(inspectorSource).toContain('id="motion-properties-tab"');
    expect(inspectorSource).toContain(
      'aria-controls="motion-properties-panel"',
    );
    expect(inspectorSource).toContain("const selectTab =");
  });
});
