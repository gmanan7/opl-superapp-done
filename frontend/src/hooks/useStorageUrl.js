// Image URLs from the upload endpoint are already plain, directly-usable URLs —
// this hook is a passthrough kept only so callers don't need to change.
export function useStorageUrl(urlOrPath) {
    return urlOrPath || null;
}
