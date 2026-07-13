import { axiosInstance } from './http/axios-instance'

export { ApiError } from './http/api-error'

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await axiosInstance.request<T>({
    url: `/api/v1${path}`,
    method: options.method ?? 'GET',
    data: options.body,
    headers: options.headers as Record<string, string> | undefined,
  })
  return response.data
}
