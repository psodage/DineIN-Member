import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

let onAuthError = null;
let memoryToken = null;

export function setOnAuthError(handler) {
  onAuthError = typeof handler === "function" ? handler : null;
}

/**
 * Sets/clears an in-memory token used for Authorization headers.
 * This enables "non-remembered" sessions (not persisted to AsyncStorage).
 */
export function setAuthToken(token) {
  memoryToken = token ? String(token) : null;
}

api.interceptors.request.use(
  async (config) => {
    const token = memoryToken || (await AsyncStorage.getItem("token"));
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      const message = err?.response?.data?.message;
      const sessionExpiredMsg =
        "Session expired. You have logged in on another device.";

      memoryToken = null;
      await AsyncStorage.multiRemove(["token", "user"]);

      // Always notify the auth context so it can clear in-memory state
      // and redirect the user to login on *any* 401.
      try {
        const type =
          message === sessionExpiredMsg ? "SESSION_EXPIRED" : "AUTH_ERROR";
        await onAuthError?.({ type, message });
      } catch (_) {
        // ignore
      }
    }
    return Promise.reject(err);
  }
);

export default api;
