import { getRuntimeConfig } from '@/services/runtimeConfig';

type ObjectStorageType = 'r2' | 's3';

export const getStorageType = (): ObjectStorageType => {
  // Client: read from runtime config injected via /runtime-config.js at container start.
  // Server: fall back to the OBJECT_STORAGE_TYPE process env var.
  // Tauri: there is no server, so getRuntimeConfig() is undefined, and
  // OBJECT_STORAGE_TYPE is never inlined into the client bundle for want of a
  // NEXT_PUBLIC_ prefix. Without the baked form the app would silently resolve
  // to 'r2' and compute different cloud object keys than the web client for the
  // same book. See deploy/docs/patch-ledger.md (P8).
  const runtimeType =
    getRuntimeConfig()?.objectStorageType ??
    process.env['OBJECT_STORAGE_TYPE'] ??
    process.env['NEXT_PUBLIC_OBJECT_STORAGE_TYPE'];
  return (runtimeType as ObjectStorageType) || 'r2';
};
