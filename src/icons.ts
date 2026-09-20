const paths: Record<string, string> = {
  fish: '<path d="M5 12c4-7 11-7 15 0-4 7-11 7-15 0Zm0 0-3-4v8Z"/><circle cx="16" cy="11" r=".7" fill="currentColor"/><path d="m11 7 3-3v4m-3 9 3 3v-4"/>',
  tree: '<path d="M12 21v-8m0 3-4-3m4 1 4-3M6 14a4 4 0 0 1-1-7 5 5 0 0 1 10-2 4 4 0 0 1 4 6 4 4 0 0 1-5 4"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
  hook: '<path d="M14 4v11a5 5 0 0 1-10 0v-4l4 3m6-10a2 2 0 1 0 0-.01Z"/><path d="m17 3 4 4m-4-4-3 3"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
  radius:
    '<circle cx="12" cy="12" r="3"/><path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  sparkles:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-1v4m-2-2h4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9m3-10v12"/>',
  book: '<path d="M12 6v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2V4Z"/>',
  volume:
    '<path d="m11 4-5 4H2v8h4l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-5 4H2v8h4l5 4V4Zm5 5 6 6m0-6-6 6"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  edit: '<path d="m15 4 5 5-10 10-6 1 1-6L15 4Zm-8 9 5 5m1-12 5 5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  left: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  mouse:
    '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7M6 10h12"/>',
  save: '<path d="m4 3 13 0 4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8"/>',
  bag: '<path d="M5 7h14l2 14H3L5 7Zm3 1V6a4 4 0 0 1 8 0v2"/>',
};
export function icon(name: string, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.fish}</svg>`;
}
