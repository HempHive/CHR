import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

function usable(storage: Storage | undefined): storage is Storage {
  return Boolean(storage && typeof storage.getItem === 'function' && typeof storage.clear === 'function');
}

function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  let current: Storage | undefined;
  try {
    current = globalThis[name];
  } catch {
    current = undefined;
  }
  if (usable(current)) return;
  Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '#/';
});
