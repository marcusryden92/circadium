// Session changes always load a whole new page rather than routing on the
// client, so nothing the previous session held in memory (the Redux store,
// fetched data, the AI key vault handle) survives into the next one.

export function hardNavigate(url: string): void {
  window.location.assign(url);
}

export function reloadPage(): void {
  window.location.reload();
}
