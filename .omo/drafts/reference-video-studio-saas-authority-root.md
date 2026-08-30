# Reference Video Studio SaaS authority root

This Markdown file is the externally anchored authority-root container for `.omo/plans/reference-video-studio-saas.md`.

Verification rules:
- Hash the entire bytes of this `.md` file when checking `RVS_AUTHORITY_ROOT_SHA256`.
- Parse exactly one fenced `json` block below as the root manifest.
- The manifest never contains this file's own digest. Its SHA-256 is supplied out-of-workspace as `RVS_AUTHORITY_ROOT_SHA256` and may be recorded only in mutable review metadata.
- Child roots may only append Todo 1 dependency-closure manifests, the Todo 1 independently reproduced fixture-output lock, the Todo 3 verifier root, and the Todo 45 final release manifest while preserving this root as `parentRootSha256`; Todo 4 verifies the fixture lock without rewriting it, and final verification consumes the verifier root and release manifest without rewriting parent entries.

```json
{
  "schemaVersion": "rvs-authority-root-v1",
  "phase": "root-v2-motion-completion",
  "generatedAt": "2026-08-30",
  "transition": {
    "previousAuthorityRootSha256": "8c0df9b22418180ab4a79d229fc5671640a50c875e62603d5ad99bb5dbe918e2",
    "planSha256": {
      "previous": "4bfa2573d0013b6b75abb864cc4d0b819fb561a252960b86b1b8f68c557baac5",
      "current": "76e3fa199e0ae8f3ae1e1e3194e454f773af6b360cb191d13f67689180baa07d"
    },
    "visualContractSha256": {
      "previous": "d06c1d7672d1278a2d94c7bad6568bc5a113dba3582d837317b3453507d5de8d",
      "current": "3846105cbc2629f9de0b41fca86f69afb3845eadd3d7580ab3e5fcbd18b5d8da"
    },
    "reason": "Record the current tracked plan after motion-completion planning without changing historical requirements."
  },
  "submoduleGitlinks": {
    "apps/worker": "20acfd5dc47c5cec7931fbf73f0febd7be600596",
    "integrations/adobe-bridge": "b4a3c5dfbbc542df02abc3f82647145b8c5b7c8a"
  },
  "container": {
    "path": ".omo/drafts/reference-video-studio-saas-authority-root.md",
    "hashRule": "Hash the entire Markdown file bytes; parse the single fenced json block as the root manifest.",
    "selfReferenceRule": "This manifest never contains the container file's own digest. The SHA-256 of these exact Markdown bytes is supplied externally as RVS_AUTHORITY_ROOT_SHA256 and recorded only in mutable review metadata."
  },
  "childRoots": {
    "allowedExtensions": ["todo1-dependency-closures", "todo1-fixture-manifest-lock", "todo3-verifier-root", "todo45-release-manifest"],
    "rule": "A child root may only append digests for the Todo 1 dependency closure manifests, the Todo 1 independently reproduced fixture output lock, the Todo 3 verifier root, and the Todo 45 final release manifest; it must record parentRootSha256 of the current root and change nothing else. Todo 4 consumes the fixture lock verification-only, F1 consumes the verifier root and release manifest, and any other mutation fails AUTHORITY_ROOT_DRIFT."
  },
  "entries": [
    {"path": ".omo/plans/reference-video-studio-saas.md", "bytes": 120040, "sha256": "76e3fa199e0ae8f3ae1e1e3194e454f773af6b360cb191d13f67689180baa07d", "role": "plan"},
    {"path": ".omo/drafts/reference-video-studio-saas-decisions-frozen.md", "bytes": 2896, "sha256": "488150b004049af82d291e467f9248ecea4cd4ef5aa6200308d867ca617ad7d7", "role": "decision-ledger"},
    {"path": ".omo/drafts/reference-video-studio-saas-normative-inputs.json", "bytes": 6815, "sha256": "1247a6d44504879a892eb19c20fe1a3962f1aaa08127c1465a68a538fcbc851e", "role": "source-identity"},
    {"path": ".omo/drafts/reference-video-studio-saas-supply-chain.json", "bytes": 9265, "sha256": "4456c5359836064f9754e92fe06fb679b6b95b4ac55a6af9d895f4ffb39cb4eb", "role": "supply-chain"},
    {"path": ".omo/drafts/reference-video-studio-saas-dependency-pins-v2.json", "bytes": 1327, "sha256": "aea5fe99a25d9dc4a34f5d9eb4a1229b445963e51dc6ee43943ca42e26636b7d", "role": "dependency-pins"},
    {"path": ".omo/drafts/reference-video-studio-saas-control-contract.jsonl", "bytes": 46059, "sha256": "3b2e78d8b0da5dc0d1bbfdb3307dee91cb2d27de4b39aa8b3e6e460a7242e849", "role": "control-contract"},
    {"path": ".omo/drafts/reference-video-studio-saas-api-action-contract.json", "bytes": 46655, "sha256": "165db55d1f0665589dcd6ec7b4a10c01e0619ea2833610a889548d2ee4960e5c", "role": "api-action-contract"},
    {"path": ".omo/drafts/reference-video-studio-saas-verification-contract.json", "bytes": 8505, "sha256": "98b8483993d67a13fff8af928f23182b946a6d72fb45443ea6f133033abc2fc7", "role": "verification-contract"},
    {"path": ".omo/drafts/reference-video-studio-saas-execution-contract-v2.json", "bytes": 9853, "sha256": "5e1f89acb46d86e6cb5add7a3f060e8dd064a1b41d212b434398538bbd779c76", "role": "execution-contract"},
    {"path": ".omo/drafts/reference-video-studio-saas-audit-registry-v2.json", "bytes": 1963, "sha256": "3f6e07a3c80acb683caabb95ac3a102d218cbed58c6f48ae02adb6a85dc87c6a", "role": "audit-registry"},
    {"path": ".omo/drafts/reference-video-studio-saas-visual-contract-v2.json", "bytes": 3137, "sha256": "3846105cbc2629f9de0b41fca86f69afb3845eadd3d7580ab3e5fcbd18b5d8da", "role": "visual-contract"},
    {"path": ".omo/drafts/reference-video-studio-saas-visual-landmarks-v1.json", "bytes": 4069, "sha256": "3eb3b8f2013682fcbee6e2b153fd6d05a7afb87859075d3666786cb5d9dfffc2", "role": "visual-landmarks"},
    {"path": ".omo/drafts/reference-video-studio-saas-fixture-contract-v2.json", "bytes": 18858, "sha256": "a2a3f6c7688396690ebf61a458f355739855d2d8920a04eedb4ed2c3c0a2300c", "role": "fixture-contract"},
    {"path": ".omo/drafts/reference-video-studio-saas-media-contract-v2.json", "bytes": 3136, "sha256": "eae9d81e45bc9cc6cb57d6b4aac7736f06f6950946ac6886540728c3d0d43d74", "role": "media-contract"}
  ]
}
```
