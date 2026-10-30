export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'dev_server_side';
  try {
    let devId = localStorage.getItem('workperhour_device_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 12);
      localStorage.setItem('workperhour_device_id', devId);
    }
    return devId;
  } catch {
    return 'dev_browser_session';
  }
};
