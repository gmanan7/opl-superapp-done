import { afterEach, vi } from 'vitest';
// Clean up localStorage between tests
afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});
