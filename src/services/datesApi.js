import api from './api';

export const createDate = async (data) => {
  const response = await api.post('/dates/', data);
  return response.data;
};

export const listDates = async (page = 1, size = 10, status = "", search = "", sort = "") => {
  let url = `/dates/?page=${page}&size=${size}`;
  if (status && status !== 'All') url += `&status=${status}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (sort) url += `&sort=${encodeURIComponent(sort)}`;
  const response = await api.get(url);
  return response.data;
};

export const getDate = async (dateId) => {
  const response = await api.get(`/dates/${dateId}`);
  return response.data;
};

export const updateDate = async (dateId, data) => {
  const response = await api.patch(`/dates/${dateId}`, data);
  return response.data;
};

export const deleteDate = async (dateId) => {
  const response = await api.delete(`/dates/${dateId}`);
  return response.data;
};

export const respondToDate = async (dateId, responseAction) => {
  const response = await api.patch(`/dates/${dateId}/respond`, { action: responseAction });
  return response.data;
};

export const completeDate = async (dateId) => {
  const response = await api.patch(`/dates/${dateId}/complete`);
  return response.data;
};

export const addReview = async (dateId, data) => {
  const formData = new FormData();
  formData.append('rating', data.rating.toString());
  formData.append('text', data.text || "");
  
  if (data.photos && data.photos.length > 0) {
    data.photos.forEach((photoUri, index) => {
      // Create a file object from the URI
      const filename = photoUri.split('/').pop() || `photo_${index}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;
      
      formData.append('files', {
        uri: photoUri,
        name: filename,
        type
      });
    });
  }

  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const token = await AsyncStorage.getItem('access_token');

  const response = await fetch(`${api.defaults.baseURL}/dates/${dateId}/review`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.log('Review upload error details:', JSON.stringify(errorData));
    throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
  }

  return await response.json();
};

export const updateReview = async (dateId, data) => {
  const formData = new FormData();
  formData.append('rating', data.rating.toString());
  formData.append('text', data.text || "");
  formData.append('existing_photos', JSON.stringify(data.existing_photos || []));
  
  if (data.photos && data.photos.length > 0) {
    data.photos.forEach((photoUri, index) => {
      const filename = photoUri.split('/').pop() || `photo_${index}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;
      
      formData.append('files', {
        uri: photoUri,
        name: filename,
        type
      });
    });
  }

  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const token = await AsyncStorage.getItem('access_token');

  const response = await fetch(`${api.defaults.baseURL}/dates/${dateId}/review/update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.log('Review edit error details:', JSON.stringify(errorData));
    throw new Error(errorData.detail || `Edit failed with status ${response.status}`);
  }

  return await response.json();
};

export const getDateReviews = async (dateId) => {
  const response = await api.get(`/dates/${dateId}/reviews`);
  return response.data;
};

export const pingDate = async (dateId, data) => {
  const response = await api.post(`/dates/${dateId}/ping`, data);
  return response.data;
};

export const requestCancelDate = async (dateId, reason) => {
  const response = await api.post(`/dates/${dateId}/request_cancel`, { reason });
  return response.data;
};

export const cancelDate = async (dateId) => {
  const response = await api.post(`/dates/${dateId}/cancel`);
  return response.data;
};

export const requestDeletePhoto = async (dateId, photoUrl) => {
  const response = await api.post(`/dates/${dateId}/photos/request_delete`, { photo_url: photoUrl });
  return response.data;
};

export const approveDeletePhoto = async (dateId, photoUrl) => {
  const response = await api.post(`/dates/${dateId}/photos/approve_delete`, { photo_url: photoUrl });
  return response.data;
};

export const rejectDeletePhoto = async (dateId, photoUrl) => {
  const response = await api.post(`/dates/${dateId}/photos/reject_delete`, { photo_url: photoUrl });
  return response.data;
};
