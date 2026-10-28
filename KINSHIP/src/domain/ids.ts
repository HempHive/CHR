export function createId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function duplicateKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join(':');
}
