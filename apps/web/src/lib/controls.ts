export type ControlState = {
  readonly state: string
  readonly disabledReason?: string | undefined
}

export type ControlProps = ControlState & {
  readonly sourceId: string
  readonly operationId: string | null
}

export const controlAttributes = (control: ControlProps): Record<string, string> => ({
  "data-control-id": control.sourceId,
  "data-operation-id": control.operationId ?? "local",
  "aria-disabled": control.state.startsWith("disabled") ? "true" : "false",
})
