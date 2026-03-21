export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function isPermissionGranted(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

export function sendNotification(title: string, body: string) {
  if (!isPermissionGranted()) return;
  new Notification(title, {
    body,
    icon: '/vite.svg',
    badge: '/vite.svg',
  });
}
