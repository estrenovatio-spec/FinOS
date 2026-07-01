let restoreDepth = 0;

export function beginCloudRestore(): void {
  restoreDepth += 1;
}

export function endCloudRestore(): void {
  restoreDepth = Math.max(0, restoreDepth - 1);
}

export function isCloudRestoreInProgress(): boolean {
  return restoreDepth > 0;
}
