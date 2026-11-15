import type { Book } from '@/types/book';

const EMPTY_DEMO_BOOKS: Book[] = [];

/**
 * Self-hosted stub — see deploy/docs/patch-ledger.md (P25).
 *
 * Upstream imports official sample EPUBs on unauthenticated Web sessions.
 * Returning a stable empty array avoids remote demo-book fetches and keeps
 * signed-out libraries empty.
 */
export const useDemoBooks = (): Book[] => EMPTY_DEMO_BOOKS;
