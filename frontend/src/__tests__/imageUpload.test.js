import { describe, it, expect } from 'vitest';
import { extractStoragePath } from '../hooks/useStorageUrl';
const SUPABASE_BASE = 'https://joryoadrvisizkkspuov.supabase.co/storage/v1/object/public/tpm-uploads';
describe('extractStoragePath', () => {
    it('strips full Supabase public URL to just the storage path', () => {
        const url = `${SUPABASE_BASE}/factory-id/group-id/opl/entity-id/photo.jpg`;
        expect(extractStoragePath(url)).toBe('factory-id/group-id/opl/entity-id/photo.jpg');
    });
    it('returns the input unchanged when it is already a plain path', () => {
        const path = 'factory-id/group-id/abn/entity-id/photo.jpg';
        expect(extractStoragePath(path)).toBe(path);
    });
    it('handles a signed URL containing /tpm-uploads/ marker', () => {
        const signedUrl = `${SUPABASE_BASE}/factory-id/group-id/kaizen/entity-id/before.png?token=xyz`;
        expect(extractStoragePath(signedUrl)).toBe('factory-id/group-id/kaizen/entity-id/before.png?token=xyz');
    });
    it('storage path format is {factory_id}/{jh_group_id}/{module}/{entity_id}/{filename}', () => {
        const factoryId = '00000000-0000-0000-0000-000000000001';
        const groupId = '00000002-0000-0000-0000-000000000001';
        const module = 'opl';
        const entityId = 'abc-def-123';
        const filename = 'before.jpg';
        const expectedPath = `${factoryId}/${groupId}/${module}/${entityId}/${filename}`;
        const url = `${SUPABASE_BASE}/${expectedPath}`;
        expect(extractStoragePath(url)).toBe(expectedPath);
        const parts = expectedPath.split('/');
        expect(parts).toHaveLength(5);
        expect(parts[2]).toBe(module);
    });
    it('returns empty string path when URL ends with just the bucket marker', () => {
        const url = `${SUPABASE_BASE}/`;
        expect(extractStoragePath(url)).toBe('');
    });
    it('handles null/empty gracefully by returning the input', () => {
        expect(extractStoragePath('')).toBe('');
    });
});
