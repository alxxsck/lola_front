import { pathToFileURL } from 'node:url';
import process from 'node:process';

export function validateVercelEnvironment(env) {
  if (env.VERCEL !== '1' && !env.VERCEL_ENV) return [];
  const errors = [];
  if (env.VITE_DATA_MODE !== 'api') {
    errors.push('VITE_DATA_MODE must be api for a Vercel deployment');
  }
  const configured = env.VITE_API_BASE_URL;
  if (!configured) {
    errors.push('VITE_API_BASE_URL is required for a Vercel deployment');
  } else {
    try {
      const url = new URL(configured);
      if (url.protocol !== 'https:') errors.push('VITE_API_BASE_URL must use https');
      if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        errors.push('VITE_API_BASE_URL must not target localhost');
      }
    } catch {
      errors.push('VITE_API_BASE_URL must be a valid absolute URL');
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateVercelEnvironment(process.env);
  if (errors.length) {
    throw new Error(`Invalid Vercel production environment:\n- ${errors.join('\n- ')}`);
  }
}
