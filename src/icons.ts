// Integer-coordinate silhouettes stay crisp alongside the game's pixel sprites.
const paths: Record<string, string> = {
  fish: "M6 4h2V2h3v2h2v2h2v4h-2v2h-2v2H8v-2H6v-2H4v2H1V4h3v2h2V4Zm5 2v2h2V6Z",
  tree: "M6 1h4v2h3v3h2v4h-3v2H9v3H7v-3H4v-2H1V6h2V3h3V1Z",
  home: "M7 1h2v2h2v2h2v2h2v2h-2v6H9v-5H7v5H3V9H1V7h2V5h2V3h2V1Z",
  hook: "M10 1h4v4h-1v6h-2v2H9v2H5v-2H3v-2H1V6h2v2h2v2H3v1h2v2h4v-2h2V5h-1V1Zm1 1v2h2V2Z",
  bolt: "M8 1h5v2h-2v2H9v2h5v2h-2v2h-2v2H8v2H5v-2h1V9H2V7h2V5h2V3h2V1Z",
  radius:
    "M1 1h5v2H3v3H1V1Zm9 0h5v5h-2V3h-3V1ZM1 10h2v3h3v2H1v-5Zm12 0h2v5h-5v-2h3v-3ZM6 5h4v1h1v4h-1v1H6v-1H5V6h1V5Zm1 2v2h2V7Z",
  sparkles:
    "M6 2h2v3h2v2h3v2h-3v2H8v3H6v-3H4V9H1V7h3V5h2V2Zm6-1h2v2h2v2h-2v2h-2V5h-2V3h2V1Z",
  coin: "M5 1h6v1h2v2h2v8h-2v2h-2v1H5v-1H3v-2H1V4h2V2h2V1Zm1 3v1H5v3h4v2H5v1h2v1h2v-1h2V7H7V6h4V5H9V4Z",
  book: "M1 2h5v1h4V2h5v11h-5v1H6v-1H1V2Zm2 2v7h3v1h1V5H5V4H3Zm8 0v1H9v7h1v-1h3V4h-2Z",
  volume:
    "M7 2h2v12H7v-2H5v-2H1V6h4V4h2V2Zm4 3h2v6h-2V5Zm2-3h2v3h1v6h-1v3h-2v-3h1V5h-1V2Z",
  muted:
    "M7 2h2v12H7v-2H5v-2H1V6h4V4h2V2Zm4 3h2v2h1V5h2v2h-2v2h2v2h-2V9h-1v2h-2V9h2V7h-2V5Z",
  settings: "M5 1h2v2h8v2H7v2H5V5H1V3h4V1Zm4 8h2v2h4v2h-4v2H9v-2H1v-2h8V9Z",
  edit: "M11 1h2v1h1v1h1v2h-2V3h-2V1ZM9 3h2v2h2v2h-2v2H9v2H7v2H5v1H1v-4h1V8h2V6h2V4h3V3Zm-5 7H3v2h2v-1H4v-1Z",
  arrow: "M8 2h2v2h2v2h2v1h1v2h-1v1h-2v2h-2v2H8v-2h2v-2h2V9H1V7h11V6h-2V4H8V2Z",
  up: "M7 1h2v1h1v2h2v2h2v2h-2V6h-2V4H9v11H7V4H6v2H4v2H2V6h2V4h2V2h1V1Z",
  down: "M7 1h2v11h1v-2h2V8h2v2h-2v2h-2v2H9v1H7v-1H6v-2H4v-2H2V8h2v2h2v2h1V1Z",
  close:
    "M3 2h2v2h2v2h2V4h2V2h2v2h-2v2H9v4h2v2h2v2h-2v-2H9v-2H7v2H5v2H3v-2h2v-2h2V6H5V4H3V2Z",
  check: "M13 3h2v2h-2v2h-2v2H9v2H7v2H5v-2H3V9H1V7h2v2h2v2h2V9h2V7h2V5h2V3Z",
  lock: "M5 1h6v2h2v4h1v8H2V7h1V3h2V1Zm0 3v3h6V4H5Zm2 6v3h2v-3Z",
  save: "M1 1h11v1h2v2h1v11H1V1Zm3 1v4h7V2H4Zm0 7v5h8V9H4Zm4-6h2v2H8V3Z",
  bag: "M5 1h6v2h2v3h2v9H1V6h2V3h2V1Zm0 3v2h6V4H5Zm-1 5v3h2V9H4Zm6 0v3h2V9h-2Z",
};
export function icon(name: string, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path fill-rule="evenodd" d="${paths[name] ?? paths.fish}"/></svg>`;
}
