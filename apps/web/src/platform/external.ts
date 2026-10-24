/** Only absolute https URLs leave the app (system browser / new tab); anything else is ignored. */
export function isExternalHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
