// api.js

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_BACKEND_URL || 'https://13-61-230-140.sslip.io',
});

api.interceptors.request.use(
  async config => {
    const token = await AsyncStorage.getItem(
      'access_token'
    );

    config.headers['ngrok-skip-browser-warning'] = 'true';

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }

    return config;
  },
  error => Promise.reject(error)
);

export default api;