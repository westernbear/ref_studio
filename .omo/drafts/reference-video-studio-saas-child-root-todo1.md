# Reference Video Studio SaaS Todo 1 child authority root

This append-only child binds the Todo 1 dependency/runtime closures and independently reproduced fixture lock to the externally anchored parent root.

```json
{
  "schemaVersion": "rvs-authority-child-root-v1",
  "phase": "todo1-runtime-authority",
  "generatedAt": "2026-08-21",
  "parent": {
    "path": ".omo/drafts/reference-video-studio-saas-authority-root.md",
    "parentRootSha256": "8c0df9b22418180ab4a79d229fc5671640a50c875e62603d5ad99bb5dbe918e2"
  },
  "allowedExtensions": [
    "todo1-dependency-closures",
    "todo1-fixture-manifest-lock"
  ],
  "entries": [
    {
      "path": "pnpm-lock.yaml",
      "bytes": 83659,
      "sha256": "d79a98c0a1050fa838c6a866179644ee311de78db8d100e358975217ca78c61e",
      "role": "npm-lock"
    },
    {
      "path": "compiler/uv.lock",
      "bytes": 92266,
      "sha256": "1b71bf3e742326fc86f94e13eeb81dfb36f8c6b8701782d11f4c488af1e6adff",
      "role": "python-lock"
    },
    {
      "path": "runtime/npm-artifact-manifest.json",
      "bytes": 108071,
      "sha256": "d293e64ea60fde4ad7564cbb54c6a76946b005f86d6548900845c3a02df4a04f",
      "role": "npm-closure"
    },
    {
      "path": "runtime/python-wheel-manifest.json",
      "bytes": 188562,
      "sha256": "62e426f070a337c2ea3917272d0c931d70172ba7cbf79cdb1a031c5b7ba82ada",
      "role": "python-closure"
    },
    {
      "path": "runtime/debian-snapshot-manifest.json",
      "bytes": 136143,
      "sha256": "7b2e622b6a9a16a84dff8d97bbda7991bfd3960aaffb1b7b67cc4cc52a70a325",
      "role": "debian-closure"
    },
    {
      "path": "runtime/debian-packages.lock",
      "bytes": 7001,
      "sha256": "4729279a364a914dc0b982b9d85324da4f33e3cf8559230a84630fbb16f68da4",
      "role": "debian-version-lock"
    },
    {
      "path": "runtime/container-child-digest-manifest.json",
      "bytes": 2568,
      "sha256": "0be887061d927eefce5614c792473a0e77d80f8da583ffaaf35c734c5f6b8a81",
      "role": "container-closure"
    },
    {
      "path": "runtime/ffmpeg-build-manifest.json",
      "bytes": 1460,
      "sha256": "3414b7d8d7620c92643a62c7c2243d46e5bfcf789484d3dac20da8da6a8bb12f",
      "role": "ffmpeg-build-closure"
    },
    {
      "path": "runtime/x264-build-manifest.json",
      "bytes": 734,
      "sha256": "23c0dcc9aceec1aa77bcf4b2efc183487c412eb8d83b5f7b6795c4e1c2eb6ac4",
      "role": "x264-build-closure"
    },
    {
      "path": "runtime/supply-closure-manifest.json",
      "bytes": 13481,
      "sha256": "2491fa669cf7acacc9de7c042c8c7e03bdfd7f8f234c4bcaa816e190be7bd9a2",
      "role": "supply-artifact-closure"
    },
    {
      "path": "runtime/runtime-artifact-manifest.json",
      "bytes": 2155,
      "sha256": "c1eb107ddeaaf6c45b226012a5e98b73c9d68e5ea96b709b2d07ea9747f1cefa",
      "role": "runtime-binary-closure"
    },
    {
      "path": "verification/contract/fixture-manifest.lock.json",
      "bytes": 21180,
      "sha256": "c15f7b7170284f5625732740216d3f79261d54b2b58ca1f112997c0b7d90b2b9",
      "role": "fixture-manifest-lock"
    }
  ]
}
```
