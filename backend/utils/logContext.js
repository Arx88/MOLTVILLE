import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export const runWithLogContext = (context, callback) => {
  const base = storage.getStore() || {};
  const nextContext = { ...base, ...(context || {}) };
  return storage.run(nextContext, callback);
};

export const getLogContext = () => storage.getStore() || null;

