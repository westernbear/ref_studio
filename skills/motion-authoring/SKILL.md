---
name: motion-authoring
description: Look up bilingual motion semantics and translate them into capability-bounded scene operations and verifiable predicates.
---

# Motion authoring

Use the host-owned `motion.lookup` before planning scene operations. The host
queries the SQLite exact-alias and FTS5 index and returns structured cards. A
model may receive `motion.lookup` only after its provider/model pair passes the
versioned tool canary.

The knowledge base has one card for each domain: reference, timing/easing,
spatial choreography, layering, transitions, typography, path/morph,
mask/matte, camera/3D, lighting/compositing, effects, audio, expressions,
interaction, and verification/accessibility.

Each result carries Korean and English definitions, distinctions, typed
parameters with units and ranges, required capabilities, scene-operation and
verifier references, and source URLs. Choose only operations supported by the
active backend capability snapshot. Preserve unsupported intent as a failed
predicate rather than inventing an operation.

Do not add embeddings, a vector database, free-form scripts, or a separate
skill per domain. Exact aliases are authoritative; FTS5 handles descriptive
queries.
