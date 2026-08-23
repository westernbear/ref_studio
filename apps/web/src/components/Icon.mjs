const paths = {
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12M18 6L6 18",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm6-2 4 4",
  arrow_forward: "M5 12h14m-6-6 6 6-6 6",
  warning: "M12 3 2 21h20L12 3Zm0 6v4m0 4h.01",
}

export function icon(name, size = 20) {
  const path = paths[name]
  if (!path) throw new Error(`Unknown local icon: ${name}`)
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" /></svg>`
}
