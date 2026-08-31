# Graph Report - corpus  (2026-08-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2854 nodes · 6195 edges · 137 communities (122 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c2067118`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app.ts
- api/server.ts
- [...slug]/page.tsx
- admin-mutation.test.ts
- dispatcher-fixture.ts
- workers.ts
- worker/contracts/scene-spec.ts
- requestId
- workers.test.ts
- creator-workflow.ts
- models.ts
- uploads.ts
- motion.ts
- material-provider.ts
- worker-api.ts
- durable-state.ts
- adobe.ts
- blender-capability.ts
- rvs-dispatcher.jsx
- contracts/scene-spec.ts
- working-copy.ts
- hydrate.mjs
- scene-review/page.tsx
- self-hosted-3d-material-provider.ts
- media-normalizer.ts
- installer.ts
- job-progress.ts
- motion-workspace-model.ts
- native-scene-package.ts
- admin-mutation.ts
- compiler-orchestrator.ts
- motion-observability.ts
- worker-job-handler.ts
- auth-proxy.ts
- webgl.ts
- lifecycle.ts
- contracts.ts
- media-validation.ts
- common.mjs
- worker/contracts/index.ts
- compile.ts
- motion-operations.ts
- motion-scene.ts
- CommandSpool
- motion-plan-generator.ts
- openai-image-material.ts
- refine-prompt.ts
- adobe-mcp-routes.ts
- render-app/index.ts
- codex-oauth.ts
- motion-canary.ts
- motion-workspace-api.ts
- browser.ts
- self-test.mjs
- tracks.ts
- enums.ts
- contracts/errors.ts
- lock.mjs
- worker-daemon.ts
- provider-models.ts
- spec-validate.test.ts
- RVSBridgePanel.jsx
- spool.ts
- motion-knowledge.ts
- retention.ts
- contracts/scene-assets.ts
- gen-render-delivery.ts
- blender-glb-contract.ts
- spec-compile.ts
- codex-chat.ts
- contracts/index.ts
- openapi.mjs
- assert-evidence.test.mjs
- finalize-manifests.mjs
- CompilerDialogue.tsx
- video-decoder.ts
- transport.ts
- author-scene-evidence.ts
- assert-evidence.mjs
- worker/index.ts
- motion-scene-commands.ts
- resolve-exact.mjs
- AiProviderSettingsForm.tsx
- api-relay.ts
- CommandRunner
- author-scene.ts
- patch-scene.ts
- [locale]/layout.tsx
- worker-preflight.ts
- validate.mjs
- build.mjs
- node-shims.d.ts
- resolve-debian.mjs
- workers/page.tsx
- worker/contracts/scene-assets.ts
- SignInForm.tsx
- CompilerChatPanel.tsx
- gen-render-delivery.determinism.test.ts
- worker-job-handler.generate.test.ts
- adobe-src/server.ts
- handoff/verify.mjs
- parseCodexAuth
- motion-artifact-gate.ts
- api/motion-predicates.ts
- deploy/verify.mjs
- refresh-current-evidence.mjs
- stamp-p7-1.mjs
- test.mjs
- emit-child-root.mjs
- panel.test.ts
- preflight.mjs
- bundle-debian.mjs
- IdempotencyStore
- coverage.mjs
- scene-review/scene-interactions.ts
- installer.test.ts
- verified-scene-authoring.ts
- worker-contracts-vendoring.test.ts
- archive-task43.mjs
- verify-frozen-config.mjs
- openapi.test.mjs
- fixtures/verify.mjs
- FakeWebSocket
- check-contract-vector.mjs
- contracts-import-convention.test.ts
- assets/verify.mjs
- verify.test.mjs
- adobe-test/contracts.test.ts
- e2e.test.ts
- execution.test.ts
- spool.test.ts
- transport.test.ts
- media/verify.mjs
- ir.ts
- remote-image-material-provider.test.ts

## God Nodes (most connected - your core abstractions)
1. `buildAuthApp()` - 68 edges
2. `field()` - 43 edges
3. `text()` - 42 edges
4. `requestId()` - 32 edges
5. `registerWorkers()` - 31 edges
6. `hashBearer` - 29 edges
7. `registerAdminMutation()` - 28 edges
8. `safeEnvelope()` - 28 edges
9. `CommandSpool` - 27 edges
10. `liveApiGet()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `loadFixture()` --indirect_call--> `Panel()`  [INFERRED]
  adobe-test/panel.test.ts → web/components/Primitives.tsx
- `appFor()` --calls--> `buildAuthApp()`  [EXTRACTED]
  api/admin-mutation.test.ts → api/app.ts
- `appFor()` --calls--> `buildAuthApp()`  [EXTRACTED]
  api/admin-read.test.ts → api/app.ts
- `restartedApp()` --calls--> `buildAuthApp()`  [EXTRACTED]
  api/refine-prompt.test.ts → api/app.ts
- `fixture()` --calls--> `hashBearer`  [EXTRACTED]
  api/upload.test.ts → api/auth.ts

## Import Cycles
- 3-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/creator-workflow.ts`
- 3-file cycle: `api/creator-workflow.ts -> api/motion-artifact-gate.ts -> api/motion-scene-store.ts -> api/creator-workflow.ts`
- 3-file cycle: `api/creator-workflow.ts -> api/workers.ts -> api/motion-operations.ts -> api/creator-workflow.ts`
- 3-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene-store.ts -> api/creator-workflow.ts`
- 3-file cycle: `api/creator-workflow.ts -> api/workers.ts -> api/motion-scene-store.ts -> api/creator-workflow.ts`
- 4-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/motion-operations.ts -> api/creator-workflow.ts`
- 4-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/motion-deliverables.ts -> api/creator-workflow.ts`
- 4-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/motion-scene-commands.ts -> api/creator-workflow.ts`
- 4-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/motion-scene-store.ts -> api/creator-workflow.ts`
- 4-file cycle: `api/creator-workflow.ts -> api/motion-artifact-gate.ts -> api/motion-scene-store.ts -> api/motion-operations.ts -> api/creator-workflow.ts`
- 4-file cycle: `api/author-scene-motion.ts -> api/motion-operations.ts -> api/creator-workflow.ts -> api/author-scene.ts -> api/author-scene-motion.ts`
- 4-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene-store.ts -> api/motion-operations.ts -> api/creator-workflow.ts`
- 4-file cycle: `api/creator-workflow.ts -> api/workers.ts -> api/motion-scene-store.ts -> api/motion-operations.ts -> api/creator-workflow.ts`
- 5-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/motion-scene-commands.ts -> api/motion-operations.ts -> api/creator-workflow.ts`
- 5-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/motion-scene-commands.ts -> api/motion-scene-store.ts -> api/creator-workflow.ts`
- 5-file cycle: `api/creator-workflow.ts -> api/refine-prompt.ts -> api/motion-scene.ts -> api/motion-scene-store.ts -> api/motion-operations.ts -> api/creator-workflow.ts`
- 5-file cycle: `api/author-scene-motion.ts -> api/motion-operations.ts -> api/creator-workflow.ts -> api/workers.ts -> api/author-scene.ts -> api/author-scene-motion.ts`
- 5-file cycle: `api/author-scene-motion.ts -> api/motion-plan-compiler.ts -> api/motion-operations.ts -> api/creator-workflow.ts -> api/author-scene.ts -> api/author-scene-motion.ts`

## Communities (137 total, 15 thin omitted)

### Community 0 - "app.ts"
Cohesion: 0.06
Nodes (61): authenticateAdminRequest(), decodeCookieValue(), AppOptions, bufferReadable(), buildAuthApp(), cookie(), failure(), header() (+53 more)

### Community 1 - "api/server.ts"
Cohesion: 0.05
Nodes (60): adminRole(), isAdminPrincipal(), createAdminMutationStore(), AdminAudit, AdminBilling, AdminJob, AdminMotionCanary, AdminMotionSummary (+52 more)

### Community 2 - "[...slug]/page.tsx"
Cohesion: 0.11
Nodes (58): adminJobColumns(), adminJobDetailActions(), adminJobDetails(), adminPageKeys, auditColumns(), auditDetails(), billingColumns(), billingDetails() (+50 more)

### Community 3 - "admin-mutation.test.ts"
Cohesion: 0.08
Nodes (45): quarantineVersion(), adminReads, appFor(), fixture(), ITEM_A_VERSION, makeJob(), runtimeDigest, workerPreflight (+37 more)

### Community 4 - "dispatcher-fixture.ts"
Cohesion: 0.05
Nodes (16): clone(), createDispatcherFixture(), DispatcherFixture, dispatchFixture(), FakeCompItem, FakeLayer, FakeLayers, FakeProperty (+8 more)

### Community 5 - "workers.ts"
Cohesion: 0.07
Nodes (54): autoApproveEvidenceVideo(), generatedAssetKey(), isArtifactContentType(), AnalysisResult, ARTIFACT_ID_PREFIX, ARTIFACT_LENGTH_MISMATCH, ArtifactContentLength, ArtifactKind (+46 more)

### Community 6 - "worker/contracts/scene-spec.ts"
Cohesion: 0.06
Nodes (36): Beat, BeatBase, beatShape, BeatV1, BeatV1Schema, BeatV2, BeatV2Schema, BoxSchema (+28 more)

### Community 7 - "requestId"
Cohesion: 0.08
Nodes (41): ASPECT_OPTIONS, DURATION_OPTIONS, formatBytes(), NewProjectPage(), PREFLIGHT_CHECKS, STATE_KEYS, Track, WorkflowState (+33 more)

### Community 8 - "workers.test.ts"
Cohesion: 0.07
Nodes (41): aiModelFromSettings(), AI_PROVIDER_KINDS, decryptSecret(), DEFAULT_SETTINGS, deriveKey(), encryptSecret(), getAiProviderSettings(), getAiProviderSettingsWithSecret() (+33 more)

### Community 9 - "creator-workflow.ts"
Cohesion: 0.07
Nodes (52): requestHash(), applyChoiceResolution(), artifactBody(), ArtifactContentType, Attempt, AuthoringPatch, autoApproveT1(), autoApproveT2T3() (+44 more)

### Community 10 - "models.ts"
Cohesion: 0.06
Nodes (47): ApiTokenId, ArtifactId, AttemptId, AuthoringIRVersionId, BrowserPassSpecVersionId, CasObjectId, CredentialId, EvidenceId (+39 more)

### Community 11 - "uploads.ts"
Cohesion: 0.06
Nodes (41): CreatorWorkflowStore, fail(), header(), registerJobAttachments(), acceptUpload(), AttachmentContentType, AttachmentRecord, CasRecord (+33 more)

### Community 12 - "motion.ts"
Cohesion: 0.05
Nodes (43): BackendCapabilitySnapshotV1, BackendCapabilitySnapshotV1Schema, CurrentVerificationReportV1Schema, DigestSchema, FiniteNumberSchema, KeyframeIntentV1, KeyframeIntentV1Schema, LEGACY_DIGEST (+35 more)

### Community 13 - "material-provider.ts"
Cohesion: 0.10
Nodes (24): CONTENT_TYPES, GeneratedMaterial, isMaterialContentType(), MATERIAL_CONTENT_TYPES, MaterialContentType, MaterialGenerationError, MaterialProvenance, MaterialProvider (+16 more)

### Community 14 - "worker-api.ts"
Cohesion: 0.08
Nodes (28): ArtifactUpload, ArtifactUploadResponse, ClaimResponse, createWorkerApi(), post(), readResponse(), errorCode(), Fetcher (+20 more)

### Community 15 - "durable-state.ts"
Cohesion: 0.06
Nodes (38): Session, ARTIFACT_CONTENT_TYPES, PreparationStage, ReleaseManifest, ArtifactMetadata, ArtifactRows, ArtifactSlot, artifactSlots() (+30 more)

### Community 16 - "adobe.ts"
Cohesion: 0.06
Nodes (34): ADOBE_PROPERTY_IDS_V1, ADOBE_TOOL_NAMES_V1, AdobeCapabilitySnapshotV1, AdobeCapabilitySnapshotV1Schema, AdobeCommandEnvelopeV1, AdobeCommandEnvelopeV1Schema, AdobeCommandResultV1, AdobeCommandResultV1Schema (+26 more)

### Community 17 - "blender-capability.ts"
Cohesion: 0.24
Nodes (9): BlenderCapabilityError, BlenderCapabilitySnapshot, CapabilitySchema, parseBlenderCapability(), parseBlenderCapabilityEnv(), REGISTERED_BLENDER, valid, EnvSchema (+1 more)

### Community 18 - "rvs-dispatcher.jsx"
Cohesion: 0.18
Nodes (35): applyTemplate(), captureRollback(), changedFields(), comp(), copyValue(), createLayer(), digest(), dispatch() (+27 more)

### Community 19 - "contracts/scene-spec.ts"
Cohesion: 0.06
Nodes (33): Beat, BeatBase, beatShape, BeatV1, BeatV1Schema, BeatV2Schema, BoxSchema, Ease (+25 more)

### Community 20 - "working-copy.ts"
Cohesion: 0.10
Nodes (21): digestFile(), main(), option(), AdobeCommandResultSchema, ExecutionContext, finalizePanelResult(), AdobeWorkingCopy, AdobeWorkingCopyError (+13 more)

### Community 21 - "hydrate.mjs"
Cohesion: 0.06
Nodes (28): artifactCacheRoot, assetRoot, baseImages, builtImages, containerManifestPath, fetchMetadata(), ffmpeg, ffmpegManifestPath (+20 more)

### Community 22 - "scene-review/page.tsx"
Cohesion: 0.10
Nodes (23): ProblemPanel(), featureCards, HomePage(), projectReturnTo, ProgressPage(), NewProjectLayout(), latestReceiptFor(), LegacyReviewStages() (+15 more)

### Community 23 - "self-hosted-3d-material-provider.ts"
Cohesion: 0.15
Nodes (14): ALPHA_COLOR_TYPES, BLENDER_SAMPLES, BlenderRenderResult, buildBlenderScript(), canonicalizeBlenderPng(), HI3DGEN_BLENDER_TOOL, Hi3DGenClient, PNG_SIGNATURE (+6 more)

### Community 24 - "media-normalizer.ts"
Cohesion: 0.19
Nodes (12): ADMITTED_FPS, audioFilter(), FrameProbe, NormalizationRequest, NormalizedMedia, normalizeMedia(), PIXEL_FORMATS, Probe (+4 more)

### Community 25 - "installer.ts"
Cohesion: 0.09
Nodes (29): activateDirectPanelLoader(), activeSignedPanelRelease(), AdobePlatform, DIRECT_PANEL_FILE, DIRECT_PANEL_LOADER, directPanelEntryPath(), discoverInstalledAfterEffectsRoots(), HashSchema (+21 more)

### Community 26 - "job-progress.ts"
Cohesion: 0.11
Nodes (30): displayPercent(), ProgressTracker(), Props, ApprovalGate, approvalGates, beatSheet(), BeatSheetEntry, decisionKey() (+22 more)

### Community 27 - "motion-workspace-model.ts"
Cohesion: 0.13
Nodes (28): clampSplitRatio(), eased(), ElementFrameState, isKeyframeV2(), moveElementOperations(), PROPERTY_CAPABILITY, SceneProperty, scenePropertySupported() (+20 more)

### Community 28 - "native-scene-package.ts"
Cohesion: 0.09
Nodes (31): assertRegularFile(), assertSafeMarkup(), ATTRIBUTES_BY_TAG, buildNativeScenePackage(), COMMON_DRAW_ATTRIBUTES, digest(), jsonBytes(), listPackageFiles() (+23 more)

### Community 29 - "admin-mutation.ts"
Cohesion: 0.12
Nodes (29): requestHeader(), AdminAuditEvent, AdminMutationExport, AdminMutationStore, AdminMutationTenant, Body, fail(), registerAdminMutation() (+21 more)

### Community 30 - "compiler-orchestrator.ts"
Cohesion: 0.07
Nodes (22): CompileRequest, CompilerGuards, CompilerInput, CompilerOrchestrator, CompilerOrchestratorError, CompilerOutput, CompilerProgress, CompilerStage (+14 more)

### Community 31 - "motion-observability.ts"
Cohesion: 0.10
Nodes (26): defaultSink, emitMotionEvent(), HISTOGRAM_METRICS, memoryEvents, memoryMetrics, MOTION_OBSERVABILITY_DASHBOARD, MotionHistogram, MotionMetric (+18 more)

### Community 32 - "worker-job-handler.ts"
Cohesion: 0.07
Nodes (38): BrowserCaptureInput, Asset, bindCompilation(), CompilationSchema, compileEvidenceScene(), DELIVERY_FPS, DELIVERY_FRAME_COUNT, EvidenceInputSchema (+30 more)

### Community 33 - "auth-proxy.ts"
Cohesion: 0.14
Nodes (25): Context, PATCH(), POST(), POST(), runtime, ADMIN_MUTATION_ROUTES, expectedOrigin(), firstHeaderValue() (+17 more)

### Community 34 - "webgl.ts"
Cohesion: 0.10
Nodes (27): ContextProbe, Contribution, createRenderPlan(), fail(), isShader(), OwnerInput, passOwners(), RenderDiagnostics (+19 more)

### Community 35 - "lifecycle.ts"
Cohesion: 0.12
Nodes (20): assertSceneOwners(), assertLegalTransition(), isLegalTransition(), JobState, JobStates, JobStateSchema, Progress, ProgressSchema (+12 more)

### Community 36 - "contracts.ts"
Cohesion: 0.07
Nodes (25): ADOBE_PROPERTY_IDS_V1, ADOBE_TOOL_NAMES_V1, AdobeCapabilitySnapshotSchema, AdobeCapabilitySnapshotV1, AdobeCapabilitySnapshotV1Schema, AdobeCommandEnvelopeV1, AdobeCommandEnvelopeV1Schema, AdobeCommandResultV1 (+17 more)

### Community 37 - "media-validation.ts"
Cohesion: 0.12
Nodes (22): command(), exactSourceInterval(), exec, FfprobeSchema, FPS, fpsValue(), fraction(), inspectUploadedMedia() (+14 more)

### Community 38 - "common.mjs"
Cohesion: 0.13
Nodes (23): args, fps, frames, profiles, assert(), EVIDENCE, expectedPipeline(), FAILURE_TOKENS (+15 more)

### Community 39 - "worker/contracts/index.ts"
Cohesion: 0.08
Nodes (34): canonicalJson(), isJsonObject(), sha256Hex(), Aspect, CANVAS, DELIVERY_FPS, GenerationConfig, GenerationConfigSchema (+26 more)

### Community 40 - "compile.ts"
Cohesion: 0.08
Nodes (32): compilation, evidence, pass, residualTrack, track, RenderInput, Asset, AudioAnchor (+24 more)

### Community 41 - "motion-operations.ts"
Cohesion: 0.13
Nodes (21): applyAt(), applySceneOperations(), assertEditableOperation(), EDITABLE_PATHS, keyframesFromMotionIntent(), pointerSegments(), UNSET_PATH, verifyAndRepair() (+13 more)

### Community 42 - "motion-scene.ts"
Cohesion: 0.19
Nodes (23): verifyMotionScene(), verifyMotionSceneForJob(), createCompletedGeneratedJob(), motionCommandHeaders, etag(), fail(), registerMotionScene(), capability() (+15 more)

### Community 43 - "CommandSpool"
Cohesion: 0.31
Nodes (4): AdobeCommandEnvelope, AdobeCommandResult, CommandSpool, isFsError()

### Community 44 - "motion-plan-generator.ts"
Cohesion: 0.13
Nodes (19): FiniteNumberSchema, generateMotionPlan(), GenerateMotionPlanCandidate, MotionPlanGeneratorInput, MotionPlanGeneratorInputSchema, MotionPlanProviderRequest, ProjectedEvidenceSchema, ProjectedOwnerSchema (+11 more)

### Community 45 - "openai-image-material.ts"
Cohesion: 0.12
Nodes (21): be32(), chunkTypeAt(), GeneratedImageMaterial, generateImageMaterial(), hasTransparentPixel(), MaterialProviderError, paeth(), persistRefreshedCodexAuth() (+13 more)

### Community 46 - "refine-prompt.ts"
Cohesion: 0.12
Nodes (23): applyScenePatch(), assertPatchable(), clamp(), DEFAULT_FEEDBACK_PROMPT, fail(), FeedbackDecision, FeedbackDecisionSchema, GenerateProposals (+15 more)

### Community 47 - "adobe-mcp-routes.ts"
Cohesion: 0.13
Nodes (16): AdobeGatewayStore, AdobeRelayFailure, CommandRow, createAdobeGatewayStore(), DeviceRows, isUniqueNonce(), KeyRow, authStore() (+8 more)

### Community 48 - "render-app/index.ts"
Cohesion: 0.24
Nodes (12): boundsAt(), createRenderApp(), effectAt(), escapeXml(), frameValue(), lifecycleFrame(), LocalFont, orderedTracks() (+4 more)

### Community 49 - "codex-oauth.ts"
Cohesion: 0.16
Nodes (18): CODEX_CLIENT_ID, CODEX_CLIENT_VERSION, CODEX_IMAGE_MODEL, CODEX_MODELS_URL, CODEX_ORIGINATOR, CODEX_TOKEN_URL, CodexAuthSchema, codexHeaders() (+10 more)

### Community 50 - "motion-canary.ts"
Cohesion: 0.13
Nodes (18): CanaryIdentitySchema, CanaryRow, executeMotionLookupTool(), GenerateLiveCanary, hostMotionLookupCanaryAdapter(), MotionCanaryAdapter, MotionCanaryPublic, MotionCanaryTimeoutError (+10 more)

### Community 51 - "motion-workspace-api.ts"
Cohesion: 0.21
Nodes (19): checked(), errorPayload(), getMotionDeliverables(), getMotionScene(), json(), MotionRenderChoice, MotionWorkspaceApiError, patchMotionScene() (+11 more)

### Community 52 - "browser.ts"
Cohesion: 0.16
Nodes (14): CanvasSize, captureBrowserFrames(), CdpClient, CdpResponse, DevToolsTarget, evaluate(), ExceptionDetails, PendingRequest (+6 more)

### Community 53 - "self-test.mjs"
Cohesion: 0.10
Nodes (17): alias, drift, falsePass, forbidden, lock, malformed, misleading, parentDrift (+9 more)

### Community 54 - "tracks.ts"
Cohesion: 0.25
Nodes (18): analysisToFrame(), audioAnchorTracks(), bboxAndTrajectoryTracks(), canvasToFrame(), ContentWindow, effectTracks(), EvidenceTrackFrame, EvidenceTrackKind (+10 more)

### Community 55 - "enums.ts"
Cohesion: 0.11
Nodes (18): Capabilities, Capability, CapabilitySchema, CredentialKinds, FeedbackDecisions, GateNames, ReceiptDecisions, ReviewDecisions (+10 more)

### Community 56 - "contracts/errors.ts"
Cohesion: 0.12
Nodes (18): CATALOG, catalogEntry(), DEFAULT_ENTRY, docsUrlFor(), ErrorCatalogEntry, ErrorCauseCategories, ErrorCauseCategory, ErrorCauseCategorySchema (+10 more)

### Community 57 - "lock.mjs"
Cohesion: 0.16
Nodes (17): audioPcmSha256(), contract, fileSha256(), generateMedia(), generatePass(), generatorClosureSha256, lock, lockPath (+9 more)

### Community 58 - "worker-daemon.ts"
Cohesion: 0.19
Nodes (18): WorkerJob, CANCELLATION_CODES, describeError(), errorCodeFrom(), isCancellation(), jobLogContext(), logWorkerJobFailure(), logWorkerJobInfo() (+10 more)

### Community 59 - "provider-models.ts"
Cohesion: 0.14
Nodes (11): GoogleListing, listCodex(), listProviderModels(), ModelCapability, ModelsFetch, OPENAI_COMPATIBLE_BASE, OpenAiListing, parse() (+3 more)

### Community 60 - "spec-validate.test.ts"
Cohesion: 0.19
Nodes (15): BeatV2, SceneSpec, SpecElementV2, fail(), SpecError, clone(), withAsset(), withAssetRef() (+7 more)

### Community 61 - "RVSBridgePanel.jsx"
Cohesion: 0.26
Nodes (14): assertBinding(), createController(), complete(), emit(), next(), release(), exactKeys(), fail() (+6 more)

### Community 62 - "spool.ts"
Cohesion: 0.14
Nodes (11): QueuedCommand, RunningCommand, StoredCommandSchema, AuthenticationError, BindingError, SpoolStateError, LifecycleSchema, LockSchema (+3 more)

### Community 63 - "motion-knowledge.ts"
Cohesion: 0.24
Nodes (14): MOTION_LOOKUP_CORPUS, hostMotionLookup(), JsonText, lookupExactMotionKnowledge(), lookupMotionKnowledge(), lookupMotionKnowledgeForBrief(), MOTION_INTERNAL_FEATURES, MOTION_LOOKUP_TOOL_SCHEMA_DIGEST (+6 more)

### Community 64 - "retention.ts"
Cohesion: 0.18
Nodes (11): assertWorkerEpoch(), authorizeExpiringAccess(), createRetentionStore(), currentDeletionEpoch(), ExpiringGrant, issueExpiringGrant(), RETENTION_DEFAULTS, RetentionFailure (+3 more)

### Community 65 - "contracts/scene-assets.ts"
Cohesion: 0.16
Nodes (12): MaterialKind, needsBytes(), planSceneAssets(), referencedAssetIds(), RequiredSceneAsset, SceneAssetError, SceneAssetPlan, SceneAssetSource (+4 more)

### Community 66 - "gen-render-delivery.ts"
Cohesion: 0.10
Nodes (30): AudioProbe, fail(), asset, canvas, validProbe, validateAudioAsset(), ValidatedAudio, BrowserCaptureReport (+22 more)

### Community 67 - "blender-glb-contract.ts"
Cohesion: 0.15
Nodes (11): ALLOWED_EXTENSIONS, Blender3dBudget, BLENDER_3D_BUDGET, embeddedTextureDimensions(), GlbChunks, GlbContractError, GlbJsonSchema, IndexSchema (+3 more)

### Community 68 - "spec-compile.ts"
Cohesion: 0.10
Nodes (33): Ease, KeyframeV1, KeyframeV2, SpecElementV1, SpecTextWeight, backgroundMarkup(), Box, colorFill() (+25 more)

### Community 69 - "codex-chat.ts"
Cohesion: 0.20
Nodes (12): codexChatBody(), createCodexFetch(), auth(), post(), refreshReply(), reply(), CODEX_BASE_URL, CODEX_RESPONSES_URL (+4 more)

### Community 70 - "contracts/index.ts"
Cohesion: 0.19
Nodes (11): canonicalJson(), isJsonObject(), sha256Hex(), Aspect, CANVAS, DELIVERY_FPS, frameCountFor(), GenerationConfig (+3 more)

### Community 71 - "openapi.mjs"
Cohesion: 0.15
Nodes (11): adobeRelayHeaders, check, document, jobIdParameter, json(), mutationHeaders, ref(), root (+3 more)

### Community 72 - "assert-evidence.test.mjs"
Cohesion: 0.12
Nodes (14): implementationCommit, indexPath, receipt, receiptPath, run, staleCommit, staleEvidencePath, staleRow (+6 more)

### Community 73 - "finalize-manifests.mjs"
Cohesion: 0.13
Nodes (13): containerPath, containers, debian, digestFiles(), digests, ffmpegManifest, ffmpegVersion, paths (+5 more)

### Community 74 - "CompilerDialogue.tsx"
Cohesion: 0.20
Nodes (14): ChatMessage, CompilerDialogue(), Proposal, Props, TranslatedOwner, PHASES, ThinkingIndicator(), isJobWorking() (+6 more)

### Community 75 - "video-decoder.ts"
Cohesion: 0.18
Nodes (12): DecodedVideo, decodeVideoAsset(), fraction(), FrameProbeSchema, isOwnedPath(), ownedDecodeDirectory(), ownedOutputPath(), ProbeSchema (+4 more)

### Community 76 - "transport.ts"
Cohesion: 0.22
Nodes (14): bodyDigest(), canonicalJson(), dispatchJsonRpc(), isObject(), JsonRpcRequest, JsonRpcResponse, RelayKey, relayRequest() (+6 more)

### Community 77 - "author-scene-evidence.ts"
Cohesion: 0.22
Nodes (12): AnyRecord, evidenceOwnerIds(), EvidenceProjectionError, isRecord(), MAX_PROJECTED_EVIDENCE_BYTES, num(), ProjectedEvidence, ProjectedOwner (+4 more)

### Community 78 - "assert-evidence.mjs"
Cohesion: 0.29
Nodes (14): currentProvenance(), fail(), lines, parseJson(), pathFor(), provenance, readHashedJson(), receiptPaths (+6 more)

### Community 79 - "worker/index.ts"
Cohesion: 0.17
Nodes (16): createWorkerRuntime(), main(), MaterialRequest, restrictToForm(), restrictToKind(), deriveMaterialSeed(), createSelfHosted3DMaterialProvider(), createSelfHostedVideoMaterialProvider() (+8 more)

### Community 80 - "motion-scene-commands.ts"
Cohesion: 0.27
Nodes (12): MotionSceneError, assertQueueable(), etag(), fail(), JobRequest, predecessorFor(), queue(), registerMotionSceneCommands() (+4 more)

### Community 81 - "resolve-exact.mjs"
Cohesion: 0.14
Nodes (9): npmPackages, pins, pinsPath, pythonPackages, pythonPath, pythonRoot, supply, supplyPath (+1 more)

### Community 82 - "AiProviderSettingsForm.tsx"
Cohesion: 0.22
Nodes (10): AiProviderSettingsForm(), isCodex(), Props, PROVIDERS, isCodex(), MaterialProviderSettingsForm(), Props, PROVIDERS (+2 more)

### Community 83 - "api-relay.ts"
Cohesion: 0.20
Nodes (9): ApiRelayConfigurationError, createApiRelayServer(), forwardedHeaders(), HOP_BY_HOP_HEADERS, main(), parseUpstream(), rejectTargetOverride(), Response (+1 more)

### Community 84 - "CommandRunner"
Cohesion: 0.18
Nodes (17): escapeDrawtext(), buildEvidenceOverlayFilter(), COLOR_BY_KIND, enableAtFrame(), labelHeight(), labelWidth(), nameLabelY(), placedLabels() (+9 more)

### Community 85 - "author-scene.ts"
Cohesion: 0.32
Nodes (10): authorScene(), applyMotionPlan(), authoringVerificationReport(), NATIVE_AUTHORING_CAPABILITIES, nativeAuthoringCapabilities(), AUTHORING_SYSTEM_PROMPT, ensureFreshMotionToolCanary(), liveProviderMotionLookupCanaryAdapter() (+2 more)

### Community 86 - "patch-scene.ts"
Cohesion: 0.24
Nodes (10): AuthoredScene, beatSheetFor(), resolvableAssetIds(), wordsFor(), deepEqual(), diffChangedBeatIds(), PatchOutputSchema, patchScene() (+2 more)

### Community 87 - "[locale]/layout.tsx"
Cohesion: 0.21
Nodes (3): DevReactTools(), routing, config

### Community 88 - "worker-preflight.ts"
Cohesion: 0.32
Nodes (9): assertRuntimeIdentity(), REGISTERED_RUNTIME, RegisteredRuntimeSnapshot, runtimeSnapshotDigest(), sha256(), Dependencies, runWorkerPreflight(), digest() (+1 more)

### Community 89 - "validate.mjs"
Cohesion: 0.21
Nodes (11): api, apiPath, canonical(), manifestPath, operationId(), operationKey(), operationKeys, oraclePath (+3 more)

### Community 90 - "build.mjs"
Cohesion: 0.17
Nodes (11): allowlist, archiveTime, digest, dist, entries, manifest, recovery, root (+3 more)

### Community 92 - "resolve-debian.mjs"
Cohesion: 0.18
Nodes (8): directPackages, manifestPath, output, packages, shell, snapshotDigest, urls, workspace

### Community 93 - "workers/page.tsx"
Cohesion: 0.27
Nodes (9): AdminWorkersPage(), FilterBar(), queryPath(), rows(), SearchState, single(), strings(), T (+1 more)

### Community 94 - "worker/contracts/scene-assets.ts"
Cohesion: 0.21
Nodes (10): MaterialKind, needsBytes(), planSceneAssets(), referencedAssetIds(), RequiredSceneAsset, SceneAssetError, SceneAssetPlan, SceneAssetSource (+2 more)

### Community 95 - "SignInForm.tsx"
Cohesion: 0.27
Nodes (5): ErrorKey, FormSubmitEvent, isSafeReturnUrl(), SignInForm(), SignInMode

### Community 96 - "CompilerChatPanel.tsx"
Cohesion: 0.29
Nodes (8): CompilerChatPanel(), Props, proxiedDownloadUrl(), sceneIntegrity(), WorkspaceMessage, MotionActionCard(), Props, jobStateKey()

### Community 97 - "gen-render-delivery.determinism.test.ts"
Cohesion: 0.24
Nodes (9): SPEC_EFFECTS, SPEC_TEXT_WEIGHTS, crc32(), defaultChromePath, defaultFontPath, landscapeFixtureSpec, makeSolidPng(), pngChunk() (+1 more)

### Community 98 - "worker-job-handler.generate.test.ts"
Cohesion: 0.24
Nodes (7): api(), attachmentSpec, job(), logoBytes, sha256(), sourceBytes, WorkflowPipelineDependencies

### Community 99 - "adobe-src/server.ts"
Cohesion: 0.33
Nodes (7): enqueueToolCall(), ToolCallSchema, AdobeCommandEnvelopeSchema, TOOL_NAMES, createServer(), INPUT_SCHEMA, runStdioServer()

### Community 100 - "handoff/verify.mjs"
Cohesion: 0.22
Nodes (8): digest, listing, manifest, recovery, root, run, task44, zip

### Community 101 - "parseCodexAuth"
Cohesion: 0.32
Nodes (7): AiModelSettings, createAiModel(), AiProviderKind, createCodexChatModel(), PersistCodexAuth, parseCodexAuth(), auth()

### Community 102 - "motion-artifact-gate.ts"
Cohesion: 0.46
Nodes (6): StoredArtifact, bytesFor(), currentDeliveryGate(), validStoredArtifact(), body(), registerMotionDeliverables()

### Community 103 - "api/motion-predicates.ts"
Cohesion: 0.39
Nodes (5): evaluate(), Finding, MotionVerificationContext, safeScene(), verifyMotionScene()

### Community 104 - "deploy/verify.mjs"
Cohesion: 0.25
Nodes (6): execution, openapi, relay, required, root, worker

### Community 105 - "refresh-current-evidence.mjs"
Cohesion: 0.25
Nodes (6): evidence, implementationCommit, receipt, receiptRow, submoduleGitlinks, taskRow

### Community 106 - "stamp-p7-1.mjs"
Cohesion: 0.25
Nodes (6): dir, implementationCommit, report, root, slices, stamp

### Community 107 - "test.mjs"
Cohesion: 0.25
Nodes (7): baseline, fixedFrames, loaded, restored, restoredState, source, sourceState

### Community 108 - "emit-child-root.mjs"
Cohesion: 0.25
Nodes (6): entries, extensions, manifest, markdown, parentRootSha256, workspace

### Community 109 - "panel.test.ts"
Cohesion: 0.33
Nodes (6): command(), Controller, Fixture, loadFixture(), setup(), Value

### Community 110 - "preflight.mjs"
Cohesion: 0.29
Nodes (3): chromeOutput, encoders, versions

### Community 111 - "bundle-debian.mjs"
Cohesion: 0.29
Nodes (6): bundlePath, bundleSha256, files, manifest, manifestPath, workspace

### Community 113 - "coverage.mjs"
Cohesion: 0.33
Nodes (5): actual, evidence, expected, oracle, root

### Community 114 - "scene-review/scene-interactions.ts"
Cohesion: 0.33
Nodes (5): eventSchema, keys, movement, SceneInteractionAction, target

### Community 115 - "installer.test.ts"
Cohesion: 0.50
Nodes (3): files, fixture(), sha256()

### Community 116 - "verified-scene-authoring.ts"
Cohesion: 0.80
Nodes (3): failureFinding(), generateVerifiedScene(), verifyAndRepair()

### Community 118 - "archive-task43.mjs"
Cohesion: 0.40
Nodes (4): advisoryPath, evidence, evidenceDir, root

### Community 119 - "verify-frozen-config.mjs"
Cohesion: 0.40
Nodes (3): auditConfig, floatingFrom, workspace

### Community 120 - "openapi.test.mjs"
Cohesion: 0.50
Nodes (3): apiMirror, generator, workspace

### Community 135 - "ir.ts"
Cohesion: 0.29
Nodes (6): AuthoringIRSchema, BrowserPassSpecSchema, EvidenceSchema, Owner, SceneIRSchema, Track

### Community 136 - "remote-image-material-provider.test.ts"
Cohesion: 0.38
Nodes (5): createRemoteImageMaterialProvider(), bytes, request, sha256, WorkerApi

## Knowledge Gaps
- **1003 isolated node(s):** `AppOptions`, `WorkerAppOptions`, `ApiToken`, `Credential`, `Membership` (+998 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SceneSpec` connect `worker/contracts/index.ts` to `worker-job-handler.ts`, `gen-render-delivery.determinism.test.ts`, `gen-render-delivery.ts`, `worker-job-handler.generate.test.ts`, `spec-compile.ts`, `worker/contracts/scene-spec.ts`, `material-provider.ts`, `native-scene-package.ts`, `worker/contracts/scene-assets.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `IdempotencyStore` connect `IdempotencyStore` to `app.ts`, `api/server.ts`, `admin-mutation.test.ts`, `creator-workflow.ts`, `refine-prompt.ts`, `durable-state.ts`, `admin-mutation.ts`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `buildAuthApp()` connect `app.ts` to `api/server.ts`, `admin-mutation.test.ts`, `workers.ts`, `workers.test.ts`, `creator-workflow.ts`, `motion-scene.ts`, `uploads.ts`, `refine-prompt.ts`, `adobe-mcp-routes.ts`, `admin-mutation.ts`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `AppOptions`, `WorkerAppOptions`, `ApiToken` to the rest of the system?**
  _1003 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05974124809741248 - nodes in this community are weakly interconnected._
- **Should `api/server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `[...slug]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10909090909090909 - nodes in this community are weakly interconnected._