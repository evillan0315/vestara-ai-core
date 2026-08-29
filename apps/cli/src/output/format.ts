export const GOLD = '\x1b[33m';
export const GREEN = '\x1b[32m';
export const RED = '\x1b[31m';
export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const GRAY = '\x1b[90m';
export const CYAN = '\x1b[36m';

export function renderStatus(success: boolean, label: string, detail?: string): string {
  const icon = success ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  const detailStr = detail ? `${GRAY}${detail}${RESET}` : '';
  return `  ${icon} ${label} ${detailStr}`;
}

export function renderStep(success: boolean, label: string, detail?: string): void {
  process.stdout.write(`${renderStatus(success, label, detail)}\n`);
}
