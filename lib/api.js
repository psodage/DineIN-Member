import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { API_BASE_URL } from "../config";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

let onAuthError = null;
let memoryToken = null;

function buildFallbackBaseUrls(baseURL) {
  const primary = String(baseURL || "").trim();
  if (!primary) return [];

  const candidates = [primary];
  if (!__DEV__ || Platform.OS !== "android") return candidates;

  try {
    const parsed = new URL(primary);
    const isPrivateIpv4 =
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(parsed.hostname);

    if (isPrivateIpv4) {
      const emulatorUrl = `${parsed.protocol}//10.0.2.2${parsed.port ? `:${parsed.port}` : ""}`;
      candidates.push(emulatorUrl);
    }

    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      const localhostUrl = `${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ""}`;
      candidates.push(localhostUrl);
    }
  } catch {
    // Ignore malformed URLs and keep the primary base URL only.
  }

  return [...new Set(candidates)];
}

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

    const fallbackBaseUrls = buildFallbackBaseUrls(config.baseURL || API_BASE_URL);
    config.baseURL = fallbackBaseUrls[0] || config.baseURL;
    config._fallbackBaseUrls = fallbackBaseUrls;
    config._fallbackAttempt = config._fallbackAttempt || 0;

    return config;
  },
  (err) => Promise.reject(err)
);

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!err.response && err.config) {
      const fallbackBaseUrls = Array.isArray(err.config._fallbackBaseUrls)
        ? err.config._fallbackBaseUrls
        : buildFallbackBaseUrls(err.config.baseURL || API_BASE_URL);
      const nextAttempt = Number(err.config._fallbackAttempt || 0) + 1;
      const nextBaseURL = fallbackBaseUrls[nextAttempt];

      if (nextBaseURL) {
        console.warn(`Retrying API request via ${nextBaseURL}`);
        err.config._fallbackAttempt = nextAttempt;
        err.config.baseURL = nextBaseURL;
        return api.request(err.config);
      }
    }

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
