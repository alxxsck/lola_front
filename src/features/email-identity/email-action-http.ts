import axios from 'axios'
import { normalizeApiError } from '@/shared/api/http/api-error'
import { resolveApiOrigin } from '@/shared/api/http/axios-instance'

export const publicEmailActionHttp = axios.create({
  baseURL: resolveApiOrigin(import.meta.env.VITE_API_BASE_URL),
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
  withCredentials: false,
})

publicEmailActionHttp.interceptors.response.use(
  (response) => response,
  (cause: unknown) => Promise.reject(normalizeApiError(cause)),
)
