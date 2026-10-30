export const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%2310b981'/%3E%3Ctext x='60' y='72' font-size='48' font-family='sans-serif' font-weight='bold' fill='white' text-anchor='middle'%3EW%3C/text%3E%3C/svg%3E";

export function getUserInitialsAvatar(name?: string): string {
  const initial = (name && name.trim().charAt(0).toUpperCase()) || 'U';
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='60' fill='%2310b981'/%3E%3Ctext x='60' y='76' font-size='56' font-family='sans-serif' font-weight='bold' fill='white' text-anchor='middle'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

export const DEFAULT_GIG_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'%3E%3Crect width='800' height='500' fill='%230f172a'/%3E%3Ctext x='400' y='250' font-size='32' font-family='sans-serif' font-weight='bold' fill='%2310b981' text-anchor='middle'%3EWorkPerHour Gig Service%3C/text%3E%3C/svg%3E";

export const DEFAULT_PROJECT_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'%3E%3Crect width='800' height='500' fill='%231e293b'/%3E%3Ctext x='400' y='250' font-size='32' font-family='sans-serif' font-weight='bold' fill='%2338bdf8' text-anchor='middle'%3EWorkPerHour Project%3C/text%3E%3C/svg%3E";

