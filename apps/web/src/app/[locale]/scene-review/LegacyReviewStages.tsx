import { getTranslations } from "next-intl/server";
import {
  approvalGates,
  decisionKey,
  gateLabelKey,
  type ApprovalGate,
} from "../../../lib/job-progress";
import { field, text } from "../../../lib/server-api";

const numberValue = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const latestReceiptFor = (
  receipts: readonly unknown[],
  gate: ApprovalGate,
  attempt: number,
): unknown =>
  [...receipts]
    .reverse()
    .find(
      (receipt) =>
        text(field(receipt, "gate"), "") === gate &&
        numberValue(field(receipt, "attempt")) === attempt,
    );

export async function LegacyReviewStages({
  jobId,
  state,
  attempt,
  receipts,
}: Readonly<{
  jobId: string;
  state: string;
  attempt: number;
  receipts: readonly unknown[];
}>) {
  const [t, tGates, tDecisions] = await Promise.all([
    getTranslations("SceneReview"),
    getTranslations("Gates"),
    getTranslations("Decisions"),
  ]);
  return (
    <>
      <div className="stitch-review-actions" data-landmark="gate-action">
        {state === "COMPLETED" ? (
          <div className="review-actions">
            <a
              className="button button-primary"
              href={`/api/v1/jobs/${encodeURIComponent(jobId)}/delivery-download`}
            >
              {t("downloadDelivery")}
            </a>
            <a
              className="button"
              href={`/api/v1/jobs/${encodeURIComponent(jobId)}/report-download`}
            >
              {t("downloadReport")}
            </a>
          </div>
        ) : null}
      </div>
      <section className="stitch-review-section" data-landmark="timeline">
        <div className="stitch-section-heading">
          <h2>{t("verificationStages")}</h2>
          <span>{t("attempt", { number: attempt })}</span>
        </div>
        <ol className="review-gate-chain">
          {approvalGates.map((gate) => {
            const receipt = latestReceiptFor(receipts, gate, attempt);
            const decision = text(field(receipt, "decision"), "PENDING");
            return (
              <li
                key={gate}
                className={
                  decision === "APPROVED"
                    ? "is-approved"
                    : decision === "REJECTED"
                      ? "is-rejected"
                      : ""
                }
              >
                <strong>{tGates(gateLabelKey(gate))}</strong>
                <span>{tDecisions(decisionKey(decision))}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
