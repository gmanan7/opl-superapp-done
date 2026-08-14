import { safeStorage } from './safeStorage';

export function getPinSession() {
    try {
        const raw = safeStorage.getItem('tpm_session');
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
