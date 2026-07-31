/** Returns YYYY-MM-DD for the next day with active availability (skips Friday). */
export function nextAvailableDate(from: Date = new Date()): string {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);

  while (date.getDay() === 5) {
    date.setDate(date.getDate() + 1);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns a booking time that is safely in the future for the given date. */
export function defaultBookingTime(date: string): string {
  const slot = new Date(`${date}T10:00:00`);
  if (slot <= new Date()) {
    return '17:00';
  }
  return '10:00';
}
