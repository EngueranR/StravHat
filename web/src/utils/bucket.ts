export type TimeBucket = "day" | "week" | "month";

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function bucketLabel(input: Date | string, bucket: TimeBucket) {
  const date = typeof input === "string" ? new Date(input) : new Date(input);

  if (bucket === "day") {
    return formatDate(date);
  }

  if (bucket === "week") {
    const dayIndex = (date.getDay() + 6) % 7;
    const start = new Date(date);
    start.setDate(date.getDate() - dayIndex);
    return formatDate(start);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function bucketRange(label: string, bucket: TimeBucket) {
  if (bucket === "day") {
    const start = new Date(`${label}T00:00:00`);
    const end = new Date(`${label}T23:59:59.999`);
    return { localFrom: start.toISOString(), localTo: end.toISOString() };
  }

  if (bucket === "week") {
    const start = new Date(`${label}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { localFrom: start.toISOString(), localTo: end.toISOString() };
  }

  const [yearStr, monthStr] = label.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { localFrom: start.toISOString(), localTo: end.toISOString() };
}
