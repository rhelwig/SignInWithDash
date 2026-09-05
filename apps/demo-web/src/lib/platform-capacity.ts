let active = 0;
export async function withPlatformCapacity<T>(operation: () => Promise<T>): Promise<T> {
  if (active >= 4) throw Object.assign(new Error("Dash verification is busy; retry shortly"), { status: 503 });
  active++;
  try { return await operation(); } finally { active--; }
}
