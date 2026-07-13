import type { AxiosRequestConfig } from 'axios'

import { axiosInstance } from './axios-instance'
import type { ApiError } from './api-error'

export type ErrorType<Error> = ApiError & { readonly details?: Error }
export type BodyType<Body> = Body

export async function request<Response>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<Response> {
  const response = await axiosInstance.request<Response>({
    ...config,
    ...options,
    headers: {
      ...config.headers,
      ...options?.headers,
    },
  })

  return response.data
}
