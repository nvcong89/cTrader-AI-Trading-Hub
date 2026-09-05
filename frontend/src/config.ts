/**
 * Dynamic API & WebSocket Endpoint Configuration
 * Automatically adapts between localhost and Remote VPS IP (e.g. YOUR_VPS_IP)
 */

export const getApiBaseUrl = (): string => {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname || 'localhost';
  if (window.location.port === '5173' || window.location.port === '3000') {
    return `${protocol}//${hostname}:8181`;
  }
  if (window.location.port) {
    return `${protocol}//${hostname}:${window.location.port}`;
  }
  return `${protocol}//${hostname}:8181`;
};

export const getWsBaseUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname || 'localhost';
  if (window.location.port === '5173' || window.location.port === '3000') {
    return `${protocol}//${hostname}:8181`;
  }
  if (window.location.port) {
    return `${protocol}//${hostname}:${window.location.port}`;
  }
  return `${protocol}//${hostname}:8181`;
};
