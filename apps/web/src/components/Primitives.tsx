import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"
import { controlAttributes, type ControlProps } from "../lib/controls"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ControlProps & { readonly children?: ReactNode }

export function ActionButton({ children, disabled, disabledReason, sourceId, operationId, state, ...props }: ButtonProps) {
  const isDisabled = disabled ?? state.startsWith("disabled")
  const metadata: ControlProps = disabledReason === undefined ? { sourceId, operationId, state } : { sourceId, operationId, state, disabledReason }
  return <button {...props} {...controlAttributes(metadata)} disabled={isDisabled} aria-describedby={disabledReason ? `${sourceId}-reason` : undefined}>{children}</button>
}

export function DisabledReason({ id, reason }: { readonly id: string; readonly reason: string }) {
  return <span id={id} className="sr-only">{reason}</span>
}

export function Panel({ children, ...props }: HTMLAttributes<HTMLElement> & { readonly children?: ReactNode }) {
  return <section {...props} className={`panel ${props.className ?? ""}`}>{children}</section>
}

export function Field({ label, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly label: string; readonly children: ReactNode }) {
  return <div {...props} className={`field ${props.className ?? ""}`}><label>{label}{children}</label></div>
}
