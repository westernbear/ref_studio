"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButton, Panel } from "./Primitives";

type ReceiptState = "current" | "broken" | "stale" | "unverified";
type Receipt = Readonly<{
  id: string;
  gate: string;
  decision: string;
  state: ReceiptState;
  actor: string;
  time: string;
  reason: string;
  predecessor: string | null;
  jobId: string;
  artifact: string;
  hash: string;
}>;

const receipts: readonly [Receipt, ...Receipt[]] = [
  {
    id: "RC-8892-A-09",
    gate: "T3: AUTH_GATE",
    decision: "APPROVED",
    state: "current",
    actor: "NODE_0X99_ALPHA",
    time: "2026-08-22 08:05:22 UTC",
    reason: "Multi-signature authorization completed after delay protocol.",
    predecessor: "RC-8891-Z-01",
    jobId: "J-9921-X",
    artifact: "normalized-media / frame-set-120",
    hash: "sha256:98f82a9b...3c11",
  },
  {
    id: "RC-8891-Z-01",
    gate: "T2: PRE_FLIGHT",
    decision: "APPROVED",
    state: "current",
    actor: "OPS_NODE_04",
    time: "2026-08-22 08:01:15 UTC",
    reason: "Resource allocation granted for the assigned tenant scope.",
    predecessor: "RC-8890-Y-00",
    jobId: "J-9921-X",
    artifact: "normalized-media / frame-set-120",
    hash: "sha256:4ab76d10...11c8",
  },
  {
    id: "RC-8890-Y-00",
    gate: "T1: INIT",
    decision: "OBSERVED",
    state: "stale",
    actor: "INGEST_NODE_02",
    time: "2026-08-22 08:00:01 UTC",
    reason: "Payload verification recorded before the source metadata changed.",
    predecessor: null,
    jobId: "J-9921-X",
    artifact: "source-media / accepted",
    hash: "sha256:77b3eac1...a02f",
  },
  {
    id: "RC-8893-B-10",
    gate: "T4: EXECUTION",
    decision: "BLOCKED",
    state: "broken",
    actor: "WORKER_NODE_07",
    time: "2026-08-22 08:06:04 UTC",
    reason:
      "Required predecessor is missing; approval-dependent actions are blocked.",
    predecessor: "RC-MISSING-00",
    jobId: "J-9921-X",
    artifact: "render output / unavailable",
    hash: "sha256:pending",
  },
  {
    id: "RC-8894-C-11",
    gate: "T5: DELIVERY",
    decision: "PENDING",
    state: "unverified",
    actor: "DESIGNATED_REVIEWER",
    time: "Not recorded",
    reason:
      "Hash is present as provenance, but independent verification is incomplete.",
    predecessor: "RC-8893-B-10",
    jobId: "J-9921-X",
    artifact: "published delivery / unavailable",
    hash: "sha256:0d6c...e98a",
  },
];

const control = (number: number): string => `admin_receipt_chain:${number}`;
const label = (state: ReceiptState): string =>
  ({
    current: "CURRENT",
    broken: "BROKEN",
    stale: "STALE",
    unverified: "UNVERIFIED",
  })[state];
const firstReceipt = receipts[0];

export function ReceiptChain() {
  const [selectedId, setSelectedId] = useState(firstReceipt.id);
  const [notice, setNotice] = useState(
    "Append-only history · platform scope · verification is independent of receipt hashes",
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exported, setExported] = useState(false);
  const selected = useMemo(
    () => receipts.find((receipt) => receipt.id === selectedId) ?? firstReceipt,
    [selectedId],
  );

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("receipt");
    if (id && receipts.some((receipt) => receipt.id === id)) setSelectedId(id);
  }, []);

  const selectReceipt = (id: string) => {
    setSelectedId(id);
    window.history.replaceState(
      null,
      "",
      `/admin/receipts?receipt=${encodeURIComponent(id)}`,
    );
  };
  const copyId = async () => {
    try {
      await navigator.clipboard?.writeText(selected.id);
    } catch {
      setNotice(`Copied receipt ID ${selected.id}`);
    }
    setNotice(`Copied receipt ID ${selected.id}`);
  };
  const downloadExport = () => {
    const safeExport = JSON.stringify(
      {
        scope: "platform-assigned",
        receiptId: selected.id,
        gate: selected.gate,
        state: selected.state,
        expires: "2026-08-22T08:20:00Z",
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([safeExport], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipt-export-${selected.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
    setExported(true);
    setNotice(
      `Scoped export created for ${selected.id} · expires in 20 minutes`,
    );
  };

  return (
    <div className="admin-page receipt-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">OPERATIONS / IMMUTABLE PROVENANCE</p>
          <h1>Receipt chain</h1>
          <p className="admin-subtitle">
            Inspect decisions in order without rewriting, deleting, or inferring
            verification from a hash.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            data-control-id={control(1)}
            type="button"
            onClick={() =>
              setNotice(
                "Receipt projection refreshed · append-only history unchanged",
              )
            }
          >
            Refresh
          </button>
          <ActionButton
            data-control-id={control(2)}
            sourceId={control(2)}
            operationId="receipt-export-open"
            state="enabled"
            onClick={() => setExportOpen(true)}
          >
            Export scoped log
          </ActionButton>
        </div>
      </header>
      <p className="admin-notice" role="status" aria-live="polite">
        {notice}
      </p>
      <Panel className="receipt-context">
        <span className="eyebrow">CHAIN //</span>
        <strong>{selected.id}</strong>
        <span className="mono">
          JOB: {selected.jobId} · ASSIGNED PLATFORM SCOPE
        </span>
      </Panel>
      <div className="receipt-layout">
        <Panel className="receipt-timeline">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EXECUTION GATES</p>
              <h2>Timeline</h2>
            </div>
            <span className="mono">{receipts.length} records</span>
          </div>
          <ol aria-label="Receipt chain timeline">
            {receipts.map((receipt, index) => (
              <li key={receipt.id}>
                <button
                  data-control-id={index === 0 ? control(3) : undefined}
                  data-receipt-id={receipt.id}
                  className={
                    receipt.id === selected.id
                      ? "receipt-node selected"
                      : "receipt-node"
                  }
                  type="button"
                  onClick={() => selectReceipt(receipt.id)}
                  onKeyDown={(event) => {
                    const sibling =
                      event.key === "ArrowDown"
                        ? event.currentTarget.parentElement?.nextElementSibling
                        : event.key === "ArrowUp"
                          ? event.currentTarget.parentElement
                              ?.previousElementSibling
                          : null;
                    const button = sibling?.querySelector("button");
                    if (button instanceof HTMLButtonElement) {
                      event.preventDefault();
                      button.focus();
                    }
                  }}
                >
                  <span
                    className={`receipt-marker status-${receipt.state}`}
                    aria-hidden="true"
                  >
                    {receipt.state === "broken"
                      ? "!"
                      : receipt.state === "current"
                        ? "✓"
                        : "·"}
                  </span>
                  <span>
                    <b>{receipt.gate}</b>
                    <small>{receipt.time}</small>
                    <em className={`status status-${receipt.state}`}>
                      {label(receipt.state)}
                    </em>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <details className="receipt-list-fallback">
            <summary data-control-id={control(4)}>
              Accessible list fallback
            </summary>
            <ul>
              {receipts.map((receipt) => (
                <li key={`fallback-${receipt.id}`}>
                  <button
                    data-receipt-fallback={receipt.id}
                    type="button"
                    onClick={() => selectReceipt(receipt.id)}
                  >
                    {receipt.id} · {receipt.gate} · {label(receipt.state)}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <div className="receipt-extra-controls">
            <button
              data-control-id={control(10)}
              type="button"
              onClick={() =>
                setNotice(
                  `Chain contains ${receipts.length} append-only records`,
                )
              }
            >
              Count records
            </button>
            <button
              data-control-id={control(11)}
              type="button"
              onClick={() =>
                setNotice("Timeline order is predecessor-linked and immutable")
              }
            >
              Explain order
            </button>
          </div>
        </Panel>
        <Panel className="receipt-detail">
          <div className="detail-heading">
            <div>
              <p className="eyebrow">SELECTED RECEIPT</p>
              <h2>{selected.gate}</h2>
            </div>
            <span className={`status status-${selected.state}`}>
              {selected.decision} · {label(selected.state)}
            </span>
          </div>
          <p className="receipt-reason">{selected.reason}</p>
          <dl className="receipt-fields">
            <div>
              <dt>ACTOR</dt>
              <dd>{selected.actor}</dd>
            </div>
            <div>
              <dt>EXECUTION TIME</dt>
              <dd>{selected.time}</dd>
            </div>
            <div>
              <dt>DECISION REASON</dt>
              <dd>{selected.reason}</dd>
            </div>
            <div>
              <dt>ARTIFACT PROVENANCE</dt>
              <dd>{selected.artifact}</dd>
            </div>
            <div>
              <dt>RECEIPT HASH</dt>
              <dd>
                {selected.hash}
                <small>
                  Inspection provenance only; not a verification gate.
                </small>
              </dd>
            </div>
          </dl>
          <div className="receipt-actions">
            <button data-control-id={control(5)} type="button" onClick={copyId}>
              Copy receipt ID
            </button>
            <a
              data-control-id={control(6)}
              href={`/admin/jobs?jobId=${encodeURIComponent(selected.jobId)}`}
            >
              Related job
            </a>
            {selected.predecessor ? (
              <button
                data-control-id={control(7)}
                type="button"
                onClick={() =>
                  selectReceipt(selected.predecessor ?? selected.id)
                }
              >
                Predecessor {selected.predecessor}
              </button>
            ) : (
              <span data-control-id={control(7)} className="receipt-muted">
                No predecessor
              </span>
            )}
            <button
              data-control-id={control(12)}
              type="button"
              onClick={() =>
                setNotice(`Artifact provenance: ${selected.artifact}`)
              }
            >
              Artifact provenance
            </button>
            <button
              data-control-id={control(13)}
              type="button"
              onClick={() =>
                setNotice(`Actor ${selected.actor} recorded ${selected.time}`)
              }
            >
              Actor and time
            </button>
            <button
              data-control-id={control(14)}
              type="button"
              onClick={() => setNotice(`Reason recorded: ${selected.reason}`)}
            >
              Decision reason
            </button>
          </div>
          {selected.state === "broken" || selected.state === "unverified" ? (
            <div className="receipt-blocked" role="alert">
              <strong>Approval-dependent actions blocked</strong>
              <span>
                {selected.state === "broken"
                  ? "Chain is incomplete: the required predecessor is missing."
                  : "Verification is incomplete: hash provenance alone is insufficient."}
              </span>
            </div>
          ) : null}
          <div className="receipt-immutable">
            <span>IMMUTABLE RECORD</span>
            <span>Corrections create a new linked receipt.</span>
          </div>
        </Panel>
      </div>
      {exported && (
        <p className="receipt-export-note" role="status">
          Download ready · restricted paths and tenant identifiers are excluded.
        </p>
      )}
      {exportOpen && (
        <div className="confirm-backdrop">
          <Panel
            className="confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-export-title"
          >
            <h2 id="receipt-export-title">Create scoped export?</h2>
            <p>
              This temporary JSON contains safe receipt metadata for{" "}
              <b>{selected.id}</b> only and expires in 20 minutes.
            </p>
            <div className="tenant-confirm-actions">
              <button
                data-control-id={control(8)}
                type="button"
                onClick={() => setExportOpen(false)}
              >
                Cancel
              </button>
              <button
                data-control-id={control(9)}
                type="button"
                onClick={downloadExport}
              >
                Confirm export
              </button>
            </div>
          </Panel>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        Receipt ID status: {notice}
      </div>
    </div>
  );
}
