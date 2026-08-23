"use client"

import { useMemo, useState } from "react"
import { ActionButton, Panel } from "../../components/Primitives"
import "./scene-review.css"

type Gate = "T1" | "T2" | "T3" | "T4" | "T5"
type Mapping = { readonly id: string; readonly label: string; readonly owner: string; readonly state: "MAPPED" | "NEEDS CHOICE" }

const evidence = [
  ["Text Extraction", "OCR", "Main_Facade_Wall", "98.4%", "native frame crop · frame 042"],
  ["Camera Motion", "CAMERA", "Static / locked", "96.1%", "gyro + optical flow · frames 000–119"],
  ["Light Fields", "DEPTH", "2.8 m foreground", "91.7%", "native depth pass · calibrated lens"],
] as const

const initialMappings: readonly Mapping[] = [
  { id: "T1", label: "Main_Facade_Wall", owner: "background", state: "MAPPED" },
  { id: "T2", label: "Signage_Board_01", owner: "title", state: "MAPPED" },
  { id: "T3", label: "Street_Debris_Scatter", owner: "unassigned", state: "NEEDS CHOICE" },
]

const gates: readonly Gate[] = ["T1", "T2", "T3", "T4", "T5"]

export default function SceneReviewPage() {
  const [frame, setFrame] = useState(42)
  const [playing, setPlaying] = useState(false)
  const [mappings, setMappings] = useState(initialMappings)
  const [choiceOpen, setChoiceOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [approved, setApproved] = useState<readonly Gate[]>([])
  const [receiptCount, setReceiptCount] = useState(0)
  const [stale, setStale] = useState(false)
  const [role, setRole] = useState<"Designated reviewer" | "Admin viewer">("Designated reviewer")
  const [notice, setNotice] = useState("")

  const currentGate = useMemo(() => gates.find((gate) => !approved.includes(gate)) ?? "T5", [approved])
  const unresolved = mappings.some((mapping) => mapping.state === "NEEDS CHOICE")
  const canApprove = role === "Designated reviewer" && !unresolved && !stale
  const approveGate = () => {
    if (!canApprove) return
    setApproved((current) => [...current, currentGate])
    setReceiptCount((count) => count + 1)
  }
  const chooseOwner = (owner: string) => {
    setMappings((current) => current.map((mapping) => mapping.id === "T3" ? { ...mapping, owner, state: "MAPPED" } : mapping))
    setChoiceOpen(false)
    setStale(true)
  }
  const editTopology = () => { setEditing((value) => !value); setStale(true) }
  const reReview = () => setStale(false)

  return <div className="review-shell">
    <header className="review-header"><a className="wordmark" href="/">REF_STUDIO</a><nav aria-label="Primary navigation"><a className="active" data-control-id="scene_review_approval:1" href="/workflow">Workflow</a><a data-control-id="scene_review_approval:2" href="/admin">Admin</a><a data-control-id="scene_review_approval:3" href="/docs">Docs</a><a data-control-id="scene_review_approval:4" href="/support">Support</a></nav><div className="review-tools"><label className="search"><span className="sr-only">Search projects</span><input data-control-id="scene_review_approval:5" placeholder="Search projects..." /></label><ActionButton sourceId="scene_review_approval:6" operationId={null} state="enabled" onClick={() => window.location.assign("/projects/new")}>New Project</ActionButton><ActionButton sourceId="scene_review_approval:7" operationId={null} state="enabled" onClick={() => setNotice("No new notifications.")}>Notifications</ActionButton><ActionButton sourceId="scene_review_approval:8" operationId={null} state="enabled" onClick={() => setRole((value) => value === "Designated reviewer" ? "Admin viewer" : "Designated reviewer")}>Role: {role}</ActionButton></div></header>
    {notice && <p className="review-notice" role="status">{notice}</p>}
    <main className="review-main">
      <section className="source-column"><div className="section-kicker">SOURCE FEED // 01 <span>LIVE-SYNC</span></div><div className="video-frame" role="img" aria-label={`Source video frame ${frame}`}><div className="grid-overlay"/><strong>DRAFT</strong><small>REC ●</small><small className="video-meta">30 FPS / 4K · FRAME {String(frame).padStart(3, "0")}</small><div className="reticle"/></div><div className="playback"><ActionButton sourceId="scene_review_approval:9" operationId={null} state="enabled" aria-label={playing ? "Pause source feed" : "Play source feed"} onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</ActionButton><input aria-label="Source frame scrubber" type="range" min="0" max="119" value={frame} onChange={(event) => setFrame(Number(event.target.value))} /><output>{String(frame).padStart(3, "0")} / 119</output></div></section>
      <section className="review-column"><div className="review-title"><div><p className="section-kicker">SCENE REVIEW / SC-994A</p><h1>Scene Review</h1><p>Analysis complete. Resolve spatial mapping before render queue insertion.</p></div><span className={`state-chip ${stale ? "warn" : ""}`}>{stale ? "STALE APPROVAL" : "OBSERVED"}</span></div>
        <section className="evidence-section"><h2>Observed measurements</h2><div className="evidence-grid">{evidence.map(([title, kind, value, confidence, provenance], index) => <Panel key={kind} className="evidence-card" tabIndex={0} data-control-id={`scene_review_approval:${10 + index}`}><div className="card-top"><span>{kind}</span><span className="confidence">{confidence}</span></div><h3>{title}</h3><strong>{value}</strong><small>{provenance}</small><div className={`evidence-bar bar-${index + 1}`} /></Panel>)}</div></section>
        <section className="mapping-section"><div className="section-heading"><h2>AuthoringIR mapping</h2><ActionButton sourceId="scene_review_approval:13" operationId="ir-edit" state="enabled" onClick={editTopology}>{editing ? "SAVE TOPOLOGY" : "EDIT TOPOLOGY"}</ActionButton></div>{editing && <p className="inline-note">Bounded edit mode: only owner and topology fields can change. OBSERVED measurements remain immutable.</p>}<div className="mapping-list">{mappings.map((mapping, index) => <button key={mapping.id} className="mapping-row" data-control-id={`scene_review_approval:${14 + index}`} onClick={() => mapping.id === "T3" && setChoiceOpen(true)}><span className="mapping-id">{mapping.id}</span><span><strong>{mapping.label}</strong><small>owner: {mapping.owner}</small></span><span className={mapping.state === "NEEDS CHOICE" ? "needs-choice" : "mapped"}>{mapping.state}</span></button>)}</div>{choiceOpen && <div className="choice" role="dialog" aria-labelledby="choice-title"><h3 id="choice-title">Resolve owner for T3</h3><p>One measured ambiguity is blocking approval. Choose an AuthoringIR owner.</p><div><button type="button" onClick={() => chooseOwner("background")}>Background</button><button type="button" onClick={() => chooseOwner("effect")}>Effect layer</button></div></div>}</section>
        <section className="gate-section"><div className="section-heading"><h2>Gate timeline / receipts</h2><span className="receipt-count">{receiptCount} append-only receipts</span></div><div className="timeline">{gates.map((gate) => <div key={gate} className={approved.includes(gate) ? "gate approved" : gate === currentGate ? "gate current" : "gate"}><span>{gate}</span><small>{approved.includes(gate) ? "APPROVED · designated reviewer" : gate === currentGate ? "CURRENT GATE" : "WAITING PREDECESSOR"}</small></div>)}</div><div className="approval-row"><div><strong>Current gate: {currentGate}</strong><small>{unresolved ? "NEEDS CHOICE blocks approval" : stale ? "Source or scene changed; re-review required" : role === "Admin viewer" ? "Admin viewer cannot approve tenant gates" : "Predecessor chain verified"}</small></div><div className="approval-actions">{stale && <button type="button" onClick={reReview}>Re-review current snapshot</button>}<ActionButton sourceId="scene_review_approval:17" operationId="review-approve" state={canApprove ? "enabled" : "disabled_blocked"} disabled={!canApprove} disabledReason="Only the designated reviewer may approve the current gate after predecessor and evidence checks." onClick={approveGate}>{approved.length === 0 ? "Approve T1" : `Approve ${currentGate}`}</ActionButton></div></div></section>
        <section className="launch-section"><div><h2>Final render</h2><p>T5 publication remains private until designated review completes. T6 release review is separate.</p></div><ActionButton sourceId="scene_review_approval:18" operationId="render-launch" state={approved.length === 5 && !stale ? "enabled" : "disabled_blocked"} disabled={approved.length !== 5 || stale} disabledReason="Complete the T1-T5 predecessor chain before launching final render.">Launch final render ↗</ActionButton></section>
        <p className="receipt-note" role="status">{stale ? "Approval receipts preserved. Correction invalidated the current approval snapshot." : "Receipt history is immutable and scoped to the designated reviewer."}</p>
      </section>
    </main>
  </div>
}
