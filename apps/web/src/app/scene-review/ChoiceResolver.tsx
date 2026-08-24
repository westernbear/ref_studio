"use client";

import { useState } from "react";
import { errorCode } from "../../lib/api-error";

type Props = {
  readonly jobId: string;
  readonly etag: string;
  readonly choiceId: string;
  readonly choiceReason: string;
  readonly ownerIds: readonly string[];
};

export function ChoiceResolver({
  jobId,
  etag,
  choiceId,
  choiceReason,
  ownerIds,
}: Props) {
  const [selection, setSelection] = useState(
    choiceId.includes("foreground")
      ? "foreground"
      : (ownerIds[0] ?? "foreground"),
  );
  const [rectangle, setRectangle] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const foreground = selection === "foreground";
  const rectangleValid =
    rectangle.x >= 0 &&
    rectangle.y >= 0 &&
    rectangle.width > 0 &&
    rectangle.height > 0 &&
    rectangle.x + rectangle.width <= 1080 &&
    rectangle.y + rectangle.height <= 1920;

  const resolve = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/jobs/${encodeURIComponent(jobId)}/choices`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `choice-${jobId}-${choiceId}`,
            "if-match": etag,
          },
          body: JSON.stringify({
            choiceId,
            polygonOrOwner: foreground
              ? {
                  polygon: [
                    { x: rectangle.x, y: rectangle.y },
                    { x: rectangle.x + rectangle.width, y: rectangle.y },
                    {
                      x: rectangle.x + rectangle.width,
                      y: rectangle.y + rectangle.height,
                    },
                    { x: rectangle.x, y: rectangle.y + rectangle.height },
                  ],
                }
              : { ownerId: selection },
            reason: `Resolved ${choiceId} in scene review`,
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = errorCode(body);
        setError(
          code === "CHOICE_NOT_CURRENT" || code === "VERSION_CONFLICT"
            ? "This choice changed. Refresh and review the current evidence."
            : `Choice resolution failed: ${code || `HTTP_${response.status}`}.`,
        );
        return;
      }
      window.location.reload();
    } catch {
      setError("The connection was interrupted. Retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="choice-form"
      onSubmit={(event) => {
        event.preventDefault();
        void resolve();
      }}
    >
      <div>
        <h3>Evidence choice required</h3>
        <p>{choiceReason || choiceId}</p>
      </div>
      <label>
        Resolution
        <select
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
        >
          {ownerIds.map((ownerId) => (
            <option key={ownerId} value={ownerId}>
              Assign to {ownerId}
            </option>
          ))}
          <option value="foreground">Create foreground from rectangle</option>
        </select>
      </label>
      {foreground ? (
        <fieldset>
          <legend>Measured rectangle (1080 x 1920)</legend>
          {(["x", "y", "width", "height"] as const).map((field) => (
            <label key={field}>
              {field.toUpperCase()}
              <input
                type="number"
                min={0}
                max={field === "x" || field === "width" ? 1080 : 1920}
                value={rectangle[field]}
                onChange={(event) =>
                  setRectangle((current) => ({
                    ...current,
                    [field]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
        </fieldset>
      ) : null}
      <button
        className="button button-primary"
        type="submit"
        disabled={submitting || (foreground && !rectangleValid)}
      >
        {submitting ? "Resolving..." : "Resolve evidence choice"}
      </button>
      <p className="review-action-status" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
