export function extractStoragePath(urlOrPath) {
    const marker = '/tpm-uploads/';
    const idx = urlOrPath.indexOf(marker);
    return idx !== -1 ? urlOrPath.substring(idx + marker.length) : urlOrPath;
}
export function useStorageUrl(urlOrPath) {
    if (!urlOrPath)
        return null;
    return urlOrPath;
}
