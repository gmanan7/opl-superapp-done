import imageCompression from 'browser-image-compression';
import { api } from './api';
const MAX_IMAGES = 2;
const MAX_SIZE_MB = 0.19;
async function compressImage(file, maxSizeKB) {
    let out = await imageCompression(file, { maxSizeMB: maxSizeKB / 1024, maxWidthOrHeight: 1200, useWebWorker: true });
    if (out.size > 256 * 1024) {
        out = await imageCompression(out, { maxSizeMB: maxSizeKB / 1024, maxWidthOrHeight: 1000, initialQuality: 0.6, useWebWorker: true });
    }
    return out;
}
export class ImageUploadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ImageUploadError';
    }
}
export function parsePhotoUrls(photoUrl) {
    if (!photoUrl)
        return [];
    try {
        const parsed = JSON.parse(photoUrl);
        if (Array.isArray(parsed))
            return parsed.filter(Boolean);
        return [photoUrl];
    }
    catch {
        return [photoUrl];
    }
}
export function serializePhotoUrls(urls) {
    if (!urls.length)
        return null;
    return JSON.stringify(urls);
}
async function fileToBase64(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => { resolve(r.result); };
        r.onerror = () => reject(new ImageUploadError('Could not read image'));
        r.readAsDataURL(blob);
    });
}
export async function uploadAbnormalityImages(files, _factoryId, _jhGroupId, _abnormalityId) {
    if (files.length > MAX_IMAGES) {
        throw new ImageUploadError(`Maximum ${MAX_IMAGES} images allowed`);
    }
    if (files.length === 0)
        return [];
    const urls = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file, MAX_SIZE_MB * 1024);
        const b64 = await fileToBase64(compressed);
        const res = await api.uploadImage(b64, file.name);
        urls.push(res.url);
    }
    return urls;
}
export async function compressImageAndUpload(file) {
    if (!file) return null;
    const compressed = await compressImage(file, 150);
    const b64 = await fileToBase64(compressed);
    const res = await api.uploadImage(b64, file.name || 'image.jpg');
    return res.url;
}
export async function uploadOplImageViaEdge(file, _oplId, _slot, _opts) {
    const url = await compressImageAndUpload(file);
    return { path: url, hash: 'hash', skipped: false };
}
export async function uploadKaizenImageViaEdge(file, _kaizenId, _slot, _opts) {
    const compressed = await compressImage(file, 150);
    const b64 = await fileToBase64(compressed);
    const res = await api.uploadImage(b64, file.name);
    return { path: res.url, hash: 'hash', skipped: false };
}
