import { api } from './api';
export const createPinUser = (data) => api.createWorker(data);
export const resetPIN = (workerId, _newPin) => api.updateWorker(workerId, { pin_hash: 'updated' });
export const createEmailUser = (data) => api.createWorker(data);
export const resetPassword = (workerId, _newPassword) => api.updateWorker(workerId, { password_hash: 'updated' });
export const updateUser = (workerId, fields) => api.updateWorker(workerId, fields);
export const deactivateUser = (workerId, _reason, _reasonText) => api.updateWorker(workerId, { is_active: false });
export const reactivateUser = (workerId) => api.updateWorker(workerId, { is_active: true });
export const generatePin = async (_workerId, _reason, _reasonText) => {
    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
    return { success: true, pin: generatedPin };
};
