import type { AxiosRequestConfig, AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios';

import { axiosInstance } from './axios-instance';
import type { ApiError } from './api-error';

export type ErrorType<Error> = ApiError & { readonly details?: Error };
export type BodyType<Body> = Body;

export interface RequestOptions extends AxiosRequestConfig {
  onResponse?: (metadata: {
    status: number;
    headers: RawAxiosResponseHeaders | AxiosResponseHeaders;
  }) => void;
}

export async function request<Response>(
  config: AxiosRequestConfig,
  options?: RequestOptions,
): Promise<Response> {
  const { onResponse, ...axiosOptions } = options ?? {};
  const response = await axiosInstance.request<Response>({
    ...config,
    ...axiosOptions,
    headers: {
      ...config.headers,
      ...axiosOptions.headers,
    },
  });

  onResponse?.({ status: response.status, headers: response.headers });

  return response.data;
}
