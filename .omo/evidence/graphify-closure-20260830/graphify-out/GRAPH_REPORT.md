# Graph Report - corpus  (2026-08-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3228 nodes · 6871 edges · 151 communities (136 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `23f1f877`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [...slug]/page.tsx
- apps-api-src/server.ts
- workers.ts
- app.ts
- contracts/scene-spec.ts
- requestId
- generated-video-delivery.ts
- adobe-bridge/dispatcher-fixture.ts
- hashBearer
- uploads.ts
- models.ts
- motion.ts
- codex-oauth.ts
- worker-job-handler.ts
- creator-workflow.ts
- openai-image-material.ts
- src/working-copy.ts
- src/installer.ts
- src/contracts.ts
- adobe.ts
- compile.ts
- packages-contracts-src/scene-spec.ts
- adobe-bridge/extendscript/rvs-dispatcher.jsx
- scripts/extendscript/rvs-dispatcher.jsx
- worker-api.ts
- adobe-bridge/working-copy.ts
- admin-mutation.ts
- hydrate.mjs
- adobe-bridge/installer.ts
- durable-state.ts
- job-progress.ts
- motion-workspace-model.ts
- native-scene-package.ts
- FakeLayers
- compiler-orchestrator.ts
- gen-render-delivery.ts
- gen-render-delivery.determinism.test.ts
- ai-provider-settings.ts
- scene-review/page.tsx
- self-hosted-3d-material-provider.ts
- auth-proxy.ts
- material-provider.ts
- webgl.ts
- media-validation.ts
- lifecycle.ts
- adobe-bridge/contracts.ts
- CommandSpool
- CommandSpool
- common.mjs
- motion-plan-generator.ts
- packages-contracts-src/index.ts
- motion-operations.ts
- freeze-contract.mjs
- adobe-mcp-routes.ts
- motion-scene.ts
- refine-prompt.ts
- adobe-bridge/transport.ts
- self-test.mjs
- workers.test.ts
- author-scene.ts
- browser.ts
- boundary.ts
- useMotionWorkspace.ts
- process-runner.ts
- tracks.ts
- test/dispatcher-fixture.ts
- src/transport.ts
- retention.ts
- generated.ts
- worker-daemon.ts
- enums.ts
- packages-contracts-src/errors.ts
- lock.mjs
- final.mjs
- packages-contracts-src/scene-assets.ts
- spec-validate.test.ts
- run-worker-pipeline.mjs
- adobe-bridge/panel/RVSBridgePanel.jsx
- scripts/panel/RVSBridgePanel.jsx
- motion-canary.ts
- src/spool.ts
- motion-knowledge.ts
- CompilerDialogue.tsx
- blender-glb-contract.ts
- openapi.mjs
- assert-evidence.test.mjs
- finalize-manifests.mjs
- remote-image-material-provider.test.ts
- apps-worker-src/index.ts
- assert-evidence.mjs
- adobe-bridge/spool.ts
- author-scene-evidence.ts
- AiProviderSettingsForm.tsx
- api-relay.ts
- media-normalizer.ts
- render-app/index.ts
- resolve-exact.mjs
- safeEnvelope
- [locale]/layout.tsx
- worker-preflight.ts
- contracts/scene-assets.ts
- validate.mjs
- build.mjs
- author-scene-motion.ts
- CreatorWorkflowStore
- node-shims.d.ts
- upload.test.ts
- workers/page.tsx
- resolve-debian.mjs
- SignInForm.tsx
- CompilerChatPanel.tsx
- packages-contracts-src/generation.ts
- handoff/verify.mjs
- run-worker-pipeline.test.mjs
- verify-contract.mjs
- deploy/verify.mjs
- refresh-current-evidence.mjs
- test.mjs
- emit-child-root.mjs
- verify-authority-root.test.mjs
- adobe-bridge/panel.test.ts
- blender-capability.ts
- preflight.mjs
- bundle-debian.mjs
- scene-review/scene-interactions.ts
- coverage.mjs
- verify-heygen-pilot-scope.mjs
- adobe-bridge/installer.test.ts
- verified-scene-authoring.ts
- worker-contracts-vendoring.test.ts
- archive-task43.mjs
- verify-frozen-config.mjs
- FakeWebSocket
- packages-contracts-src/canonical-json.ts
- openapi.test.mjs
- fixtures/verify.mjs
- verify-advisory.mjs
- check-contract-vector.mjs
- contracts-import-convention.test.ts
- assets/verify.mjs
- verify.test.mjs
- adobe-bridge/contracts.test.ts
- adobe-bridge/e2e.test.ts
- adobe-bridge/execution.test.ts
- adobe-bridge/spool.test.ts
- test/e2e.test.ts
- adobe-bridge/transport.test.ts
- media/verify.mjs
- video-decoder.ts

## God Nodes (most connected - your core abstractions)
1. `buildAuthApp()` - 68 edges
2. `field()` - 43 edges
3. `text()` - 42 edges
4. `requestId()` - 32 edges
5. `registerWorkers()` - 31 edges
6. `CommandSpool` - 29 edges
7. `hashBearer` - 29 edges
8. `safeEnvelope()` - 28 edges
9. `CommandSpool` - 27 edges
10. `liveApiGet()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `loadFixture()` --indirect_call--> `Panel()`  [INFERRED]
  adobe-bridge/panel.test.ts → apps-web-src/components/Primitives.tsx
- `loadFixture()` --indirect_call--> `Panel()`  [INFERRED]
  adobe-bridge/test/panel.test.ts → apps-web-src/components/Primitives.tsx
- `HomePage()` --calls--> `liveApiGet()`  [EXTRACTED]
  apps-web-src/app/[locale]/page.tsx → apps-web-src/lib/server-api.ts
- `appFor()` --calls--> `buildAuthApp()`  [EXTRACTED]
  apps-api-src/admin-read.test.ts → apps-api-src/app.ts
- `fixture()` --calls--> `hashBearer`  [EXTRACTED]
  apps-api-src/upload.test.ts → apps-api-src/auth.ts

## Import Cycles
- 3-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/motion-artifact-gate.ts -> apps-api-src/motion-scene-store.ts -> apps-api-src/creator-workflow.ts`
- 3-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/refine-prompt.ts -> apps-api-src/motion-scene.ts -> apps-api-src/creator-workflow.ts`
- 3-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/refine-prompt.ts -> apps-api-src/motion-scene-store.ts -> apps-api-src/creator-workflow.ts`
- 3-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/workers.ts -> apps-api-src/motion-scene-store.ts -> apps-api-src/creator-workflow.ts`
- 4-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/refine-prompt.ts -> apps-api-src/motion-scene.ts -> apps-api-src/motion-deliverables.ts -> apps-api-src/creator-workflow.ts`
- 4-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/refine-prompt.ts -> apps-api-src/motion-scene.ts -> apps-api-src/motion-scene-commands.ts -> apps-api-src/creator-workflow.ts`
- 4-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/refine-prompt.ts -> apps-api-src/motion-scene.ts -> apps-api-src/motion-scene-store.ts -> apps-api-src/creator-workflow.ts`
- 5-file cycle: `apps-api-src/creator-workflow.ts -> apps-api-src/refine-prompt.ts -> apps-api-src/motion-scene.ts -> apps-api-src/motion-scene-commands.ts -> apps-api-src/motion-scene-store.ts -> apps-api-src/creator-workflow.ts`

## Communities (151 total, 15 thin omitted)

### Community 0 - "[...slug]/page.tsx"
Cohesion: 0.11
Nodes (58): adminJobColumns(), adminJobDetailActions(), adminJobDetails(), adminPageKeys, auditColumns(), auditDetails(), billingColumns(), billingDetails() (+50 more)

### Community 1 - "apps-api-src/server.ts"
Cohesion: 0.05
Nodes (55): adminRole(), isAdminPrincipal(), AdminAudit, AdminBilling, AdminJob, AdminMotionCanary, AdminMotionSummary, AdminQuarantine (+47 more)

### Community 2 - "workers.ts"
Cohesion: 0.06
Nodes (58): autoApproveEvidenceVideo(), generatedAssetKey(), isArtifactContentType(), AnalysisResult, ARTIFACT_ID_PREFIX, ARTIFACT_LENGTH_MISMATCH, ArtifactContentLength, ArtifactKind (+50 more)

### Community 3 - "app.ts"
Cohesion: 0.07
Nodes (46): authenticateAdminRequest(), decodeCookieValue(), createAdminMutationStore(), adminReads, appFor(), fixture(), ITEM_A_VERSION, makeJob() (+38 more)

### Community 4 - "contracts/scene-spec.ts"
Cohesion: 0.05
Nodes (50): Beat, BeatBase, beatShape, BeatV1, BeatV1Schema, BeatV2, BeatV2Schema, BoxSchema (+42 more)

### Community 5 - "requestId"
Cohesion: 0.08
Nodes (41): ASPECT_OPTIONS, DURATION_OPTIONS, formatBytes(), NewProjectPage(), PREFLIGHT_CHECKS, STATE_KEYS, Track, WorkflowState (+33 more)

### Community 6 - "generated-video-delivery.ts"
Cohesion: 0.16
Nodes (15): AudioProbe, fail(), asset, canvas, validProbe, validateAudioAsset(), ValidatedAudio, SpecAsset (+7 more)

### Community 7 - "adobe-bridge/dispatcher-fixture.ts"
Cohesion: 0.05
Nodes (16): clone(), createDispatcherFixture(), DispatcherFixture, dispatchFixture(), FakeCompItem, FakeLayer, FakeLayers, FakeProperty (+8 more)

### Community 8 - "hashBearer"
Cohesion: 0.10
Nodes (41): Assignment, AuthStore, hashBearer, compilation, fixture(), headers, preflight, reviewerHeaders (+33 more)

### Community 9 - "uploads.ts"
Cohesion: 0.06
Nodes (45): fail(), header(), registerJobAttachments(), abortUpload(), acceptUpload(), AttachmentContentType, AttachmentRecord, CasRecord (+37 more)

### Community 10 - "models.ts"
Cohesion: 0.06
Nodes (47): ApiTokenId, ArtifactId, AttemptId, AuthoringIRVersionId, BrowserPassSpecVersionId, CasObjectId, CredentialId, EvidenceId (+39 more)

### Community 11 - "motion.ts"
Cohesion: 0.05
Nodes (43): BackendCapabilitySnapshotV1, BackendCapabilitySnapshotV1Schema, CurrentVerificationReportV1Schema, DigestSchema, FiniteNumberSchema, KeyframeIntentV1, KeyframeIntentV1Schema, LEGACY_DIGEST (+35 more)

### Community 12 - "codex-oauth.ts"
Cohesion: 0.09
Nodes (37): AiModelSettings, createAiModel(), AiProviderKind, codexChatBody(), createCodexChatModel(), createCodexFetch(), PersistCodexAuth, auth() (+29 more)

### Community 13 - "worker-job-handler.ts"
Cohesion: 0.06
Nodes (48): BrowserCaptureReport, Asset, bindCompilation(), CompilationSchema, compileEvidenceScene(), DELIVERY_FPS, DELIVERY_FRAME_COUNT, EvidenceInputSchema (+40 more)

### Community 14 - "creator-workflow.ts"
Cohesion: 0.08
Nodes (41): requestHash(), applyChoiceResolution(), artifactBody(), ArtifactContentType, Attempt, AuthoringPatch, autoApproveT1(), autoResolveChoice() (+33 more)

### Community 15 - "openai-image-material.ts"
Cohesion: 0.09
Nodes (36): decryptSecret(), DEFAULT_SETTINGS, deriveKey(), encryptSecret(), getMaterialProviderSettings(), getMaterialProviderSettingsWithSecret(), MATERIAL_PROVIDER_KINDS, MaterialProviderKind (+28 more)

### Community 16 - "src/working-copy.ts"
Cohesion: 0.10
Nodes (22): digestFile(), main(), option(), ExecutionContext, finalizePanelResult(), runStdioServer(), AdobeWorkingCopy, AdobeWorkingCopyError (+14 more)

### Community 17 - "src/installer.ts"
Cohesion: 0.08
Nodes (32): activateDirectPanelLoader(), activeSignedPanelRelease(), AdobePlatform, DIRECT_PANEL_FILE, DIRECT_PANEL_LOADER, directPanelEntryPath(), discoverInstalledAfterEffectsRoots(), HashSchema (+24 more)

### Community 18 - "src/contracts.ts"
Cohesion: 0.06
Nodes (32): enqueueToolCall(), ToolCallSchema, ADOBE_PROPERTY_IDS_V1, ADOBE_TOOL_NAMES_V1, AdobeCapabilitySnapshotSchema, AdobeCapabilitySnapshotV1, AdobeCapabilitySnapshotV1Schema, AdobeCommandEnvelopeSchema (+24 more)

### Community 19 - "adobe.ts"
Cohesion: 0.06
Nodes (34): ADOBE_PROPERTY_IDS_V1, ADOBE_TOOL_NAMES_V1, AdobeCapabilitySnapshotV1, AdobeCapabilitySnapshotV1Schema, AdobeCommandEnvelopeV1, AdobeCommandEnvelopeV1Schema, AdobeCommandResultV1, AdobeCommandResultV1Schema (+26 more)

### Community 20 - "compile.ts"
Cohesion: 0.08
Nodes (32): compilation, evidence, pass, residualTrack, track, RenderInput, Asset, AudioAnchor (+24 more)

### Community 21 - "packages-contracts-src/scene-spec.ts"
Cohesion: 0.06
Nodes (33): Beat, BeatBase, beatShape, BeatV1, BeatV1Schema, BeatV2Schema, BoxSchema, Ease (+25 more)

### Community 22 - "adobe-bridge/extendscript/rvs-dispatcher.jsx"
Cohesion: 0.18
Nodes (35): applyTemplate(), captureRollback(), changedFields(), comp(), copyValue(), createLayer(), digest(), dispatch() (+27 more)

### Community 23 - "scripts/extendscript/rvs-dispatcher.jsx"
Cohesion: 0.18
Nodes (35): applyTemplate(), captureRollback(), changedFields(), comp(), copyValue(), createLayer(), digest(), dispatch() (+27 more)

### Community 24 - "worker-api.ts"
Cohesion: 0.09
Nodes (27): ArtifactUpload, ArtifactUploadResponse, ClaimResponse, createWorkerApi(), post(), readResponse(), errorCode(), Fetcher (+19 more)

### Community 25 - "adobe-bridge/working-copy.ts"
Cohesion: 0.10
Nodes (21): digestFile(), main(), option(), AdobeCommandResultSchema, ExecutionContext, finalizePanelResult(), AdobeWorkingCopy, AdobeWorkingCopyError (+13 more)

### Community 26 - "admin-mutation.ts"
Cohesion: 0.09
Nodes (26): requestHeader(), AdminAuditEvent, AdminMutationExport, AdminMutationStore, AdminMutationTenant, Body, fail(), quarantineVersion() (+18 more)

### Community 27 - "hydrate.mjs"
Cohesion: 0.06
Nodes (28): artifactCacheRoot, assetRoot, baseImages, builtImages, containerManifestPath, fetchMetadata(), ffmpeg, ffmpegManifestPath (+20 more)

### Community 28 - "adobe-bridge/installer.ts"
Cohesion: 0.09
Nodes (29): activateDirectPanelLoader(), activeSignedPanelRelease(), AdobePlatform, DIRECT_PANEL_FILE, DIRECT_PANEL_LOADER, directPanelEntryPath(), discoverInstalledAfterEffectsRoots(), HashSchema (+21 more)

### Community 29 - "durable-state.ts"
Cohesion: 0.07
Nodes (33): Session, ARTIFACT_CONTENT_TYPES, PreparationStage, ReleaseManifest, ArtifactMetadata, ArtifactRows, ArtifactSlot, artifactSlots() (+25 more)

### Community 30 - "job-progress.ts"
Cohesion: 0.11
Nodes (30): displayPercent(), ProgressTracker(), Props, ApprovalGate, approvalGates, beatSheet(), BeatSheetEntry, decisionKey() (+22 more)

### Community 31 - "motion-workspace-model.ts"
Cohesion: 0.13
Nodes (28): clampSplitRatio(), eased(), ElementFrameState, isKeyframeV2(), moveElementOperations(), PROPERTY_CAPABILITY, SceneProperty, scenePropertySupported() (+20 more)

### Community 32 - "native-scene-package.ts"
Cohesion: 0.09
Nodes (31): assertRegularFile(), assertSafeMarkup(), ATTRIBUTES_BY_TAG, buildNativeScenePackage(), COMMON_DRAW_ATTRIBUTES, digest(), jsonBytes(), listPackageFiles() (+23 more)

### Community 33 - "FakeLayers"
Cohesion: 0.09
Nodes (4): clone(), FakeLayer, FakeLayers, FakeProperty

### Community 34 - "compiler-orchestrator.ts"
Cohesion: 0.07
Nodes (22): CompileRequest, CompilerGuards, CompilerInput, CompilerOrchestrator, CompilerOrchestratorError, CompilerOutput, CompilerProgress, CompilerStage (+14 more)

### Community 35 - "gen-render-delivery.ts"
Cohesion: 0.09
Nodes (35): BrowserCaptureInput, canonicalJson(), isJsonObject(), sha256Hex(), SceneSpec, SceneSpecSchema, GeneratedRenderReport, isDeclaredCanvas() (+27 more)

### Community 36 - "gen-render-delivery.determinism.test.ts"
Cohesion: 0.11
Nodes (19): Aspect, CANVAS, DELIVERY_FPS, GenerationConfig, GenerationConfigSchema, fixtureSpec, SceneSpecV1, SPEC_EFFECTS (+11 more)

### Community 37 - "ai-provider-settings.ts"
Cohesion: 0.13
Nodes (25): aiModelFromSettings(), AI_PROVIDER_KINDS, decryptSecret(), DEFAULT_SETTINGS, deriveKey(), encryptSecret(), getAiProviderSettings(), getAiProviderSettingsWithSecret() (+17 more)

### Community 38 - "scene-review/page.tsx"
Cohesion: 0.10
Nodes (23): ProblemPanel(), featureCards, HomePage(), projectReturnTo, ProgressPage(), NewProjectLayout(), latestReceiptFor(), LegacyReviewStages() (+15 more)

### Community 39 - "self-hosted-3d-material-provider.ts"
Cohesion: 0.15
Nodes (14): ALPHA_COLOR_TYPES, BLENDER_SAMPLES, BlenderRenderResult, buildBlenderScript(), canonicalizeBlenderPng(), HI3DGEN_BLENDER_TOOL, Hi3DGenClient, PNG_SIGNATURE (+6 more)

### Community 40 - "auth-proxy.ts"
Cohesion: 0.14
Nodes (25): Context, PATCH(), POST(), POST(), runtime, ADMIN_MUTATION_ROUTES, expectedOrigin(), firstHeaderValue() (+17 more)

### Community 41 - "material-provider.ts"
Cohesion: 0.11
Nodes (21): CONTENT_TYPES, GeneratedMaterial, isMaterialContentType(), MATERIAL_CONTENT_TYPES, MaterialContentType, MaterialGenerationError, MaterialProvenance, MaterialProvider (+13 more)

### Community 42 - "webgl.ts"
Cohesion: 0.09
Nodes (23): ContextProbe, Contribution, isShader(), OwnerInput, passOwners(), RenderDiagnostics, RenderPlan, REQUIRED_LAYERS (+15 more)

### Community 43 - "media-validation.ts"
Cohesion: 0.11
Nodes (24): command(), exactSourceInterval(), exec, FfprobeSchema, FPS, fpsValue(), fraction(), inspectUploadedMedia() (+16 more)

### Community 44 - "lifecycle.ts"
Cohesion: 0.09
Nodes (26): assertSceneOwners(), AuthoringIRSchema, BrowserPassSpecSchema, EvidenceSchema, Owner, SceneIRSchema, Track, assertLegalTransition() (+18 more)

### Community 45 - "adobe-bridge/contracts.ts"
Cohesion: 0.07
Nodes (25): ADOBE_PROPERTY_IDS_V1, ADOBE_TOOL_NAMES_V1, AdobeCapabilitySnapshotSchema, AdobeCapabilitySnapshotV1, AdobeCapabilitySnapshotV1Schema, AdobeCommandEnvelopeV1, AdobeCommandEnvelopeV1Schema, AdobeCommandResultV1 (+17 more)

### Community 46 - "CommandSpool"
Cohesion: 0.27
Nodes (6): AdobeCommandEnvelope, AdobeCommandResult, QueuedCommand, RunningCommand, CommandSpool, isFsError()

### Community 47 - "CommandSpool"
Cohesion: 0.27
Nodes (6): AdobeCommandEnvelope, AdobeCommandResult, QueuedCommand, RunningCommand, CommandSpool, isFsError()

### Community 48 - "common.mjs"
Cohesion: 0.13
Nodes (23): args, fps, frames, profiles, assert(), EVIDENCE, expectedPipeline(), FAILURE_TOKENS (+15 more)

### Community 49 - "motion-plan-generator.ts"
Cohesion: 0.11
Nodes (21): GenerateScene, MOTION_LOOKUP_TOOL_SCHEMA_DIGEST, FiniteNumberSchema, generateMotionPlan(), GenerateMotionPlanCandidate, MotionPlanGeneratorInput, MotionPlanGeneratorInputSchema, MotionPlanProviderRequest (+13 more)

### Community 50 - "packages-contracts-src/index.ts"
Cohesion: 0.12
Nodes (20): defaultSink, emitMotionEvent(), memoryEvents, memoryMetrics, MotionMetric, MotionMetricSample, MotionObservabilityEvent, MotionObservabilityEvents (+12 more)

### Community 51 - "motion-operations.ts"
Cohesion: 0.13
Nodes (21): applyAt(), applySceneOperations(), assertEditableOperation(), EDITABLE_PATHS, keyframesFromMotionIntent(), pointerSegments(), UNSET_PATH, verifyAndRepair() (+13 more)

### Community 52 - "freeze-contract.mjs"
Cohesion: 0.08
Nodes (23): api, apiDoc, contractDir, controls, emit, entries, files, forbiddenImportScanSha256 (+15 more)

### Community 53 - "adobe-mcp-routes.ts"
Cohesion: 0.13
Nodes (17): AdobeGatewayStore, AdobeRelayFailure, CommandRow, createAdobeGatewayStore(), DeviceRows, isUniqueNonce(), KeyRow, authStore() (+9 more)

### Community 54 - "motion-scene.ts"
Cohesion: 0.21
Nodes (22): verifyMotionScene(), createCompletedGeneratedJob(), motionCommandHeaders, etag(), fail(), registerMotionScene(), capability(), commitMotionSceneVersion() (+14 more)

### Community 55 - "refine-prompt.ts"
Cohesion: 0.12
Nodes (23): applyScenePatch(), assertPatchable(), clamp(), DEFAULT_FEEDBACK_PROMPT, fail(), FeedbackDecision, FeedbackDecisionSchema, GenerateProposals (+15 more)

### Community 56 - "adobe-bridge/transport.ts"
Cohesion: 0.14
Nodes (21): enqueueToolCall(), ToolCallSchema, AdobeCommandEnvelopeSchema, TOOL_NAMES, createServer(), INPUT_SCHEMA, runStdioServer(), bodyDigest() (+13 more)

### Community 57 - "self-test.mjs"
Cohesion: 0.09
Nodes (19): alias, drift, falsePass, forbidden, lock, malformed, misleading, parentDrift (+11 more)

### Community 58 - "workers.test.ts"
Cohesion: 0.11
Nodes (18): Gate, GATE_DAG, ReviewDecision, ReviewReceipt, ReviewStore, addJob(), analysisEvidence(), compilation (+10 more)

### Community 59 - "author-scene.ts"
Cohesion: 0.17
Nodes (17): AuthoredScene, authorScene(), evidenceOwnerIds(), applyMotionPlan(), nativeAuthoringCapabilities(), AUTHORING_SYSTEM_PROMPT, resolvableAssetIds(), wordsFor() (+9 more)

### Community 60 - "browser.ts"
Cohesion: 0.15
Nodes (18): CanvasSize, captureBrowserFrames(), CdpClient, CdpResponse, DevToolsTarget, evaluate(), ExceptionDetails, PendingRequest (+10 more)

### Community 61 - "boundary.ts"
Cohesion: 0.13
Nodes (13): Principal, BoundaryFailure, FencedAccess, FencedResource, fenceRequest(), fenceResource(), IdempotencyRecord, IdempotencyStore (+5 more)

### Community 62 - "useMotionWorkspace.ts"
Cohesion: 0.22
Nodes (18): checked(), errorPayload(), getMotionDeliverables(), getMotionScene(), json(), MotionWorkspaceApiError, patchMotionScene(), PatchResponseSchema (+10 more)

### Community 63 - "process-runner.ts"
Cohesion: 0.11
Nodes (25): escapeDrawtext(), buildEvidenceOverlayFilter(), COLOR_BY_KIND, enableAtFrame(), labelHeight(), labelWidth(), nameLabelY(), placedLabels() (+17 more)

### Community 64 - "tracks.ts"
Cohesion: 0.25
Nodes (18): analysisToFrame(), audioAnchorTracks(), bboxAndTrajectoryTracks(), canvasToFrame(), ContentWindow, effectTracks(), EvidenceTrackFrame, EvidenceTrackKind (+10 more)

### Community 65 - "test/dispatcher-fixture.ts"
Cohesion: 0.13
Nodes (12): AdobeCommandResultSchema, createDispatcherFixture(), DispatcherFixture, dispatchFixture(), FakeCompItem, FakeShape, Json, normalized() (+4 more)

### Community 66 - "src/transport.ts"
Cohesion: 0.18
Nodes (17): bodyDigest(), canonicalJson(), dispatchJsonRpc(), isObject(), JsonRpcRequest, JsonRpcResponse, RelayKey, relayRequest() (+9 more)

### Community 67 - "retention.ts"
Cohesion: 0.17
Nodes (14): advanceDeletionEpoch(), assertWorkerEpoch(), authorizeExpiringAccess(), cleanupRetention(), createRetentionStore(), currentDeletionEpoch(), ExpiringGrant, issueExpiringGrant() (+6 more)

### Community 68 - "generated.ts"
Cohesion: 0.20
Nodes (15): backgroundMarkup(), Box, colorFill(), createGeneratedRenderApp(), drawMarkup(), effectLayerMarkup(), effectLayersMarkup(), escapeXml() (+7 more)

### Community 69 - "worker-daemon.ts"
Cohesion: 0.19
Nodes (18): WorkerJob, CANCELLATION_CODES, describeError(), errorCodeFrom(), isCancellation(), jobLogContext(), logWorkerJobFailure(), logWorkerJobInfo() (+10 more)

### Community 70 - "enums.ts"
Cohesion: 0.11
Nodes (18): Capabilities, Capability, CapabilitySchema, CredentialKinds, FeedbackDecisions, GateNames, ReceiptDecisions, ReviewDecisions (+10 more)

### Community 71 - "packages-contracts-src/errors.ts"
Cohesion: 0.12
Nodes (18): CATALOG, catalogEntry(), DEFAULT_ENTRY, docsUrlFor(), ErrorCatalogEntry, ErrorCauseCategories, ErrorCauseCategory, ErrorCauseCategorySchema (+10 more)

### Community 72 - "lock.mjs"
Cohesion: 0.16
Nodes (17): audioPcmSha256(), contract, fileSha256(), generateMedia(), generatePass(), generatorClosureSha256, lock, lockPath (+9 more)

### Community 73 - "final.mjs"
Cohesion: 0.26
Nodes (17): args, exists(), fail(), json(), modes, required(), root, sha256() (+9 more)

### Community 74 - "packages-contracts-src/scene-assets.ts"
Cohesion: 0.14
Nodes (14): MaterialKind, needsBytes(), planSceneAssets(), referencedAssetIds(), RequiredSceneAsset, SceneAssetError, SceneAssetPlan, SceneAssetSource (+6 more)

### Community 75 - "spec-validate.test.ts"
Cohesion: 0.19
Nodes (15): BeatV2, SceneSpec, SpecElementV2, fail(), SpecError, clone(), withAsset(), withAssetRef() (+7 more)

### Community 76 - "run-worker-pipeline.mjs"
Cohesion: 0.12
Nodes (15): api, common, expectedSourceSha256, handler, outputPath, provenance, renderPayload, sha256() (+7 more)

### Community 77 - "adobe-bridge/panel/RVSBridgePanel.jsx"
Cohesion: 0.26
Nodes (14): assertBinding(), createController(), complete(), emit(), next(), release(), exactKeys(), fail() (+6 more)

### Community 78 - "scripts/panel/RVSBridgePanel.jsx"
Cohesion: 0.26
Nodes (14): assertBinding(), createController(), complete(), emit(), next(), release(), exactKeys(), fail() (+6 more)

### Community 79 - "motion-canary.ts"
Cohesion: 0.15
Nodes (13): CanaryIdentitySchema, CanaryRow, listMotionToolCanaries(), MotionCanaryAdapter, MotionCanaryPublic, MotionCanaryTimeoutError, runMotionToolCanary(), store() (+5 more)

### Community 80 - "src/spool.ts"
Cohesion: 0.14
Nodes (10): StoredCommandSchema, AuthenticationError, BindingError, SpoolStateError, LifecycleSchema, LockSchema, SpoolOptions, TimestampSchema (+2 more)

### Community 81 - "motion-knowledge.ts"
Cohesion: 0.25
Nodes (13): MOTION_LOOKUP_CORPUS, hostMotionLookup(), JsonText, lookupExactMotionKnowledge(), lookupMotionKnowledge(), lookupMotionKnowledgeForBrief(), MOTION_INTERNAL_FEATURES, MotionCanaryIdentity (+5 more)

### Community 82 - "CompilerDialogue.tsx"
Cohesion: 0.20
Nodes (14): ChatMessage, CompilerDialogue(), Proposal, Props, TranslatedOwner, PHASES, ThinkingIndicator(), isJobWorking() (+6 more)

### Community 83 - "blender-glb-contract.ts"
Cohesion: 0.15
Nodes (11): ALLOWED_EXTENSIONS, Blender3dBudget, BLENDER_3D_BUDGET, embeddedTextureDimensions(), GlbChunks, GlbContractError, GlbJsonSchema, IndexSchema (+3 more)

### Community 84 - "openapi.mjs"
Cohesion: 0.15
Nodes (11): adobeRelayHeaders, check, document, jobIdParameter, json(), mutationHeaders, ref(), root (+3 more)

### Community 85 - "assert-evidence.test.mjs"
Cohesion: 0.12
Nodes (14): implementationCommit, indexPath, receipt, receiptPath, run, staleCommit, staleEvidencePath, staleRow (+6 more)

### Community 86 - "finalize-manifests.mjs"
Cohesion: 0.13
Nodes (13): containerPath, containers, debian, digestFiles(), digests, ffmpegManifest, ffmpegVersion, paths (+5 more)

### Community 87 - "remote-image-material-provider.test.ts"
Cohesion: 0.38
Nodes (5): createRemoteImageMaterialProvider(), bytes, request, sha256, WorkerApi

### Community 88 - "apps-worker-src/index.ts"
Cohesion: 0.17
Nodes (16): createWorkerRuntime(), main(), MaterialRequest, restrictToForm(), restrictToKind(), deriveMaterialSeed(), createSelfHosted3DMaterialProvider(), createSelfHostedVideoMaterialProvider() (+8 more)

### Community 89 - "assert-evidence.mjs"
Cohesion: 0.29
Nodes (14): currentProvenance(), fail(), lines, parseJson(), pathFor(), provenance, readHashedJson(), receiptPaths (+6 more)

### Community 90 - "adobe-bridge/spool.ts"
Cohesion: 0.16
Nodes (9): StoredCommandSchema, AuthenticationError, BindingError, SpoolStateError, LifecycleSchema, LockSchema, SpoolOptions, TimestampSchema (+1 more)

### Community 91 - "author-scene-evidence.ts"
Cohesion: 0.23
Nodes (11): AnyRecord, EvidenceProjectionError, isRecord(), MAX_PROJECTED_EVIDENCE_BYTES, num(), ProjectedEvidence, ProjectedOwner, projectEvidenceForAuthoring() (+3 more)

### Community 92 - "AiProviderSettingsForm.tsx"
Cohesion: 0.22
Nodes (10): AiProviderSettingsForm(), isCodex(), Props, PROVIDERS, isCodex(), MaterialProviderSettingsForm(), Props, PROVIDERS (+2 more)

### Community 93 - "api-relay.ts"
Cohesion: 0.20
Nodes (9): ApiRelayConfigurationError, createApiRelayServer(), forwardedHeaders(), HOP_BY_HOP_HEADERS, main(), parseUpstream(), rejectTargetOverride(), Response (+1 more)

### Community 94 - "media-normalizer.ts"
Cohesion: 0.19
Nodes (12): ADMITTED_FPS, audioFilter(), FrameProbe, NormalizationRequest, NormalizedMedia, normalizeMedia(), PIXEL_FORMATS, Probe (+4 more)

### Community 95 - "render-app/index.ts"
Cohesion: 0.24
Nodes (12): boundsAt(), createRenderApp(), effectAt(), escapeXml(), frameValue(), lifecycleFrame(), LocalFont, orderedTracks() (+4 more)

### Community 96 - "resolve-exact.mjs"
Cohesion: 0.14
Nodes (9): npmPackages, pins, pinsPath, pythonPackages, pythonPath, pythonRoot, supply, supplyPath (+1 more)

### Community 97 - "safeEnvelope"
Cohesion: 0.28
Nodes (11): beatSheetFor(), safeEnvelope(), MotionSceneError, assertQueueable(), etag(), fail(), JobRequest, queue() (+3 more)

### Community 98 - "[locale]/layout.tsx"
Cohesion: 0.21
Nodes (3): DevReactTools(), routing, config

### Community 99 - "worker-preflight.ts"
Cohesion: 0.29
Nodes (10): assertRuntimeIdentity(), REGISTERED_RUNTIME, RegisteredRuntimeSnapshot, runtimeSnapshotDigest(), sha256(), Dependencies, runWorkerPreflight(), digest() (+2 more)

### Community 100 - "contracts/scene-assets.ts"
Cohesion: 0.21
Nodes (10): MaterialKind, needsBytes(), planSceneAssets(), referencedAssetIds(), RequiredSceneAsset, SceneAssetError, SceneAssetPlan, SceneAssetSource (+2 more)

### Community 101 - "validate.mjs"
Cohesion: 0.21
Nodes (11): api, apiPath, canonical(), manifestPath, operationId(), operationKey(), operationKeys, oraclePath (+3 more)

### Community 102 - "build.mjs"
Cohesion: 0.17
Nodes (11): allowlist, archiveTime, digest, dist, entries, manifest, recovery, root (+3 more)

### Community 103 - "author-scene-motion.ts"
Cohesion: 0.29
Nodes (7): authoringVerificationReport(), NATIVE_AUTHORING_CAPABILITIES, evaluate(), Finding, MotionVerificationContext, safeScene(), verifyMotionScene()

### Community 104 - "CreatorWorkflowStore"
Cohesion: 0.31
Nodes (9): CreatorWorkflowStore, Job, owned(), StoredArtifact, bytesFor(), currentDeliveryGate(), validStoredArtifact(), body() (+1 more)

### Community 106 - "upload.test.ts"
Cohesion: 0.25
Nodes (9): appFor(), commandHeaders(), fixture(), headers(), sha256(), uploadBytes(), cleanupExpiredUploads(), MAX_CHUNK_BYTES (+1 more)

### Community 107 - "workers/page.tsx"
Cohesion: 0.27
Nodes (9): AdminWorkersPage(), FilterBar(), queryPath(), rows(), SearchState, single(), strings(), T (+1 more)

### Community 108 - "resolve-debian.mjs"
Cohesion: 0.18
Nodes (8): directPackages, manifestPath, output, packages, shell, snapshotDigest, urls, workspace

### Community 109 - "SignInForm.tsx"
Cohesion: 0.14
Nodes (11): command(), Controller, Fixture, loadFixture(), setup(), Value, ErrorKey, FormSubmitEvent (+3 more)

### Community 110 - "CompilerChatPanel.tsx"
Cohesion: 0.29
Nodes (8): CompilerChatPanel(), Props, proxiedDownloadUrl(), sceneIntegrity(), WorkspaceMessage, MotionActionCard(), Props, jobStateKey()

### Community 111 - "packages-contracts-src/generation.ts"
Cohesion: 0.36
Nodes (6): Aspect, CANVAS, DELIVERY_FPS, frameCountFor(), GenerationConfig, GenerationConfigSchema

### Community 112 - "handoff/verify.mjs"
Cohesion: 0.22
Nodes (8): digest, listing, manifest, recovery, root, run, task44, zip

### Community 113 - "run-worker-pipeline.test.mjs"
Cohesion: 0.25
Nodes (6): exampleResult, fixture(), provenance, runner, sha256(), workspace

### Community 114 - "verify-contract.mjs"
Cohesion: 0.22
Nodes (6): block, lock, lockPath, root, rootPath, workspace

### Community 115 - "deploy/verify.mjs"
Cohesion: 0.25
Nodes (6): execution, openapi, relay, required, root, worker

### Community 116 - "refresh-current-evidence.mjs"
Cohesion: 0.25
Nodes (6): evidence, implementationCommit, receipt, receiptRow, submoduleGitlinks, taskRow

### Community 117 - "test.mjs"
Cohesion: 0.25
Nodes (7): baseline, fixedFrames, loaded, restored, restoredState, source, sourceState

### Community 118 - "emit-child-root.mjs"
Cohesion: 0.25
Nodes (6): entries, extensions, manifest, markdown, parentRootSha256, workspace

### Community 119 - "verify-authority-root.test.mjs"
Cohesion: 0.36
Nodes (7): fixture(), rejects(), run(), scratchRoot, sha256(), verifier, workspace

### Community 120 - "adobe-bridge/panel.test.ts"
Cohesion: 0.33
Nodes (6): command(), Controller, Fixture, loadFixture(), setup(), Value

### Community 121 - "blender-capability.ts"
Cohesion: 0.24
Nodes (9): BlenderCapabilityError, BlenderCapabilitySnapshot, CapabilitySchema, parseBlenderCapability(), parseBlenderCapabilityEnv(), REGISTERED_BLENDER, valid, EnvSchema (+1 more)

### Community 122 - "preflight.mjs"
Cohesion: 0.29
Nodes (3): chromeOutput, encoders, versions

### Community 123 - "bundle-debian.mjs"
Cohesion: 0.29
Nodes (6): bundlePath, bundleSha256, files, manifest, manifestPath, workspace

### Community 124 - "scene-review/scene-interactions.ts"
Cohesion: 0.33
Nodes (5): eventSchema, keys, movement, SceneInteractionAction, target

### Community 125 - "coverage.mjs"
Cohesion: 0.33
Nodes (5): actual, evidence, expected, oracle, root

### Community 126 - "verify-heygen-pilot-scope.mjs"
Cohesion: 0.33
Nodes (5): brief, example, project, result, workspace

### Community 127 - "adobe-bridge/installer.test.ts"
Cohesion: 0.50
Nodes (3): files, fixture(), sha256()

### Community 128 - "verified-scene-authoring.ts"
Cohesion: 0.80
Nodes (3): failureFinding(), generateVerifiedScene(), verifyAndRepair()

### Community 130 - "archive-task43.mjs"
Cohesion: 0.40
Nodes (4): advisoryPath, evidence, evidenceDir, root

### Community 131 - "verify-frozen-config.mjs"
Cohesion: 0.40
Nodes (3): auditConfig, floatingFrom, workspace

### Community 133 - "packages-contracts-src/canonical-json.ts"
Cohesion: 0.83
Nodes (3): canonicalJson(), isJsonObject(), sha256Hex()

### Community 134 - "openapi.test.mjs"
Cohesion: 0.50
Nodes (3): apiMirror, generator, workspace

### Community 136 - "verify-advisory.mjs"
Cohesion: 0.50
Nodes (3): advisory, args, digest

### Community 150 - "video-decoder.ts"
Cohesion: 0.23
Nodes (11): DecodedVideo, decodeVideoAsset(), fraction(), FrameProbeSchema, isOwnedPath(), ownedDecodeDirectory(), ownedOutputPath(), ProbeSchema (+3 more)

## Knowledge Gaps
- **1123 isolated node(s):** `Column`, `SearchState`, `SelectOption`, `T`, `AdminMotionCanary` (+1118 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `error()` connect `workers.ts` to `final.mjs`, `safeEnvelope`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `SceneSpec` connect `gen-render-delivery.ts` to `native-scene-package.ts`, `contracts/scene-assets.ts`, `contracts/scene-spec.ts`, `generated-video-delivery.ts`, `gen-render-delivery.determinism.test.ts`, `generated.ts`, `material-provider.ts`, `worker-job-handler.ts`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `buildAuthApp()` connect `app.ts` to `apps-api-src/server.ts`, `safeEnvelope`, `retention.ts`, `workers.ts`, `workers.test.ts`, `hashBearer`, `uploads.ts`, `upload.test.ts`, `creator-workflow.ts`, `adobe-mcp-routes.ts`, `motion-scene.ts`, `refine-prompt.ts`, `admin-mutation.ts`, `boundary.ts`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `Column`, `SearchState`, `SelectOption` to the rest of the system?**
  _1123 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[...slug]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10909090909090909 - nodes in this community are weakly interconnected._
- **Should `apps-api-src/server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05182443151771549 - nodes in this community are weakly interconnected._
- **Should `workers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059322033898305086 - nodes in this community are weakly interconnected._