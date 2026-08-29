"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ThinkingPhase } from "../lib/job-progress";

export type { ThinkingPhase };

// What the screen shows while the model is working and has produced
// nothing yet.
//
// The gap is real: authoring a scene is a single model call that takes
// 25-37 seconds against a live provider, and until it answers the chat had
// nothing in it. A blank pane for half a minute is indistinguishable from
// a broken one -- people resubmit, or leave.
//
// Three things, from what the established AI chat interfaces do:
//
//  - Motion that says "received, working": three dots on a staggered
//    bounce, plus a shimmer sweeping the label. Either alone reads as a
//    generic spinner; together they read as someone composing.
//  - Text that says what is happening now, rotating through the phases the
//    work actually goes through rather than repeating one word. A label
//    that never changes for thirty seconds reads as stuck.
//  - A rotation slow enough to read. Under about 1.5s the phases flicker
//    and a screen reader in a polite region is interrupted mid-sentence;
//    PHASE_MS is deliberately well above that.
//
// aria-live is polite and sits on the label alone, so the rotating text is
// announced and the decorative dots are not. Under prefers-reduced-motion
// the CSS drops the bounce and the shimmer and leaves the dots and the
// rotating text -- the information survives, the movement does not.
const PHASE_MS = 2_600;

// Per phase, in order. Kept short: this is a status line, not a log.
const PHASES: Readonly<Record<ThinkingPhase, readonly string[]>> = {
  authoring: [
    "authoringReading",
    "authoringShaping",
    "authoringWriting",
    "authoringChecking",
  ],
  patching: ["patchingReading", "patchingApplying", "patchingChecking"],
  // One phrase, not a rotation: the stage checklist directly above this
  // reports the real stage and its progress. Rotating invented phases beside
  // a live checklist would put two different stories on the same screen.
  compiling: ["compilingWorking"],
};

export function ThinkingIndicator({
  phase,
}: {
  readonly phase: ThinkingPhase;
}) {
  const t = useTranslations("ThinkingIndicator");
  const steps = PHASES[phase];
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    // Stops at the last phrase rather than looping back to the first:
    // returning to "reading the brief" after half a minute would say the
    // work had restarted, which is not what happened.
    const timer = window.setInterval(() => {
      setStep((current) =>
        current < steps.length - 1 ? current + 1 : current,
      );
    }, PHASE_MS);
    return () => window.clearInterval(timer);
  }, [phase, steps.length]);

  return (
    <div className="dialogue-message dialogue-message-thinking">
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="thinking-label" aria-live="polite">
        {t(steps[step] ?? steps[0] ?? "authoringReading")}
      </span>
    </div>
  );
}
