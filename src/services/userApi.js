// src/services/userApi.js
import api from './api';

export const getUsers = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const deletePhoto = async () => {
  const response = await api.delete('/users/photo');
  return response.data;
};

export const getAlignedSyncSummary = async (timezone = "UTC") => {
  const params = new URLSearchParams({ timezone, _t: Date.now().toString() });
  const response = await api.get(`/users/sync-summary?${params.toString()}`);
  return response.data;
};

export const loginUser = async (data) => {
  const response = await api.post('/login', data);
  return response.data;
};

export const createRelationship = async (data) => {
  const response = await api.post('/users/create', data);
  return response.data;
};

export const updateUserProfile = async ({ name, gender }) => {
  const body = {};
  if (name !== undefined) body.name = name;
  if (gender !== undefined) body.gender = gender;
  const response = await api.patch('/users/me', body);
  return response.data;
};

import { clearMeCache } from './authApi';

let userProfileCachePromise = null;
let userProfileCacheTime = 0;
const USER_PROFILE_CACHE_TTL = 3000;

export const clearUserProfileCache = () => {
  userProfileCachePromise = null;
  userProfileCacheTime = 0;
};

export const getUserProfile = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && userProfileCachePromise && now - userProfileCacheTime < USER_PROFILE_CACHE_TTL) {
    return userProfileCachePromise;
  }

  userProfileCacheTime = now;
  userProfileCachePromise = api
    .get('/users')
    .then((res) => res.data)
    .catch((err) => {
      userProfileCachePromise = null;
      userProfileCacheTime = 0;
      throw err;
    });

  return userProfileCachePromise;
};

let partnerCachePromise = null;
let partnerCacheTime = 0;
const PARTNER_CACHE_TTL = 3000;

export const clearPartnerCache = () => {
  partnerCachePromise = null;
  partnerCacheTime = 0;
};

export const getPartnerProfile = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && partnerCachePromise && now - partnerCacheTime < PARTNER_CACHE_TTL) {
    return partnerCachePromise;
  }

  partnerCacheTime = now;
  partnerCachePromise = api
    .get('/users/partner')
    .then((res) => res.data)
    .catch((err) => {
      partnerCachePromise = null;
      partnerCacheTime = 0;
      throw err;
    });

  return partnerCachePromise;
};

/**
 * @param {'aligned' | 'vibe'} [context]
 * @param {string | null} [partnerId]
 * @returns {Promise<any>}
 */
export const getFastPartnerPicture = async (context = 'aligned', partnerId = null) => {
  const params = new URLSearchParams();
  if (context) params.append('context', context);
  if (partnerId) params.append('partner_id', partnerId);
  const response = await api.get(`/users/partner/picture?${params.toString()}`);
  return response.data;
};


export const uploadProfilePhoto = async (imageUri, cropData = null) => {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const token = await AsyncStorage.getItem('access_token');

  let filename = imageUri.split('/').pop() || 'profile.jpg';
  let match = /\.(\w+)$/.exec(filename);
  let type = match ? `image/${match[1]}` : `image/jpeg`;
  if (type === 'image/jpg') type = 'image/jpeg';

  const formData = new FormData();
  if (imageUri.startsWith('blob:') || imageUri.startsWith('data:')) {
    const res = await fetch(imageUri);
    const blob = await res.blob();
    formData.append('file', blob, filename);
  } else {
    // @ts-ignore - React Native
    formData.append('file', {
      uri: imageUri,
      name: filename,
      type: type,
    });
  }

  if (cropData) {
    if (cropData.originX !== undefined) formData.append('crop_x', String(cropData.originX));
    if (cropData.originY !== undefined) formData.append('crop_y', String(cropData.originY));
    if (cropData.width !== undefined) formData.append('crop_width', String(cropData.width));
    if (cropData.height !== undefined) formData.append('crop_height', String(cropData.height));
    if (cropData.rotate !== undefined) formData.append('rotate', String(cropData.rotate));
  }

  let baseUrl = api.defaults.baseURL || '';
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const response = await fetch(`${baseUrl}/users/photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
  }

  // Clear in-memory caches so subsequent calls get the new profile photo
  clearMeCache();
  clearUserProfileCache();

  const result = await response.json();
  return result;
};

export const breakAlignment = async (password) => {
  const response = await api.post('/users/break-alignment', { password });
  return response.data;
};

export const deleteAccount = async (password, target = 'all') => {
  const response = await api.post('/auth/delete-account', { password, target });
  return response.data;
};

export const alignWithPartner = async (secret_key) => {
  const response = await api.post('/users/aligned', { secret_key });
  return response.data;
};

export const sendAlignmentRequest = async (secret_key) => {
  const response = await api.post('/users/aligned/request', { secret_key });
  return response.data;
};

export const getAlignmentRequestStatus = async () => {
  const response = await api.get('/users/aligned/request');
  return response.data;
};

export const respondAlignmentRequest = async (request_id, accept) => {
  const response = await api.post('/users/aligned/request/respond', { request_id, accept });
  return response.data;
};

export const cancelAlignmentRequest = async (request_id) => {
  const response = await api.post('/users/aligned/request/cancel', { request_id });
  return response.data;
};

export const getProfilePhotos = async () => {
  const response = await api.get('/users/photos');
  return response.data;
};

export const selectProfilePhoto = async (photoId) => {
  const response = await api.post('/users/photo/select', { photo_id: photoId });
  return response.data;
};

export const deleteProfilePhotoItem = async (photo_id) => {
  const response = await api.delete(`/users/photos/${photo_id}`);
  return response.data;
};

export const regenerateAlignedKey = async () => {
  const response = await api.post('/users/regenerate-key');
  return response.data;
};

export const updateUserKeySettings = async (settings) => {
  const response = await api.patch('/users/me', settings);
  return response.data;
};