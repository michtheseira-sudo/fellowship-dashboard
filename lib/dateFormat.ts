import { format, parse, isValid } from "date-fns";

const DISPLAY_FORMAT = "dd-MM-yyyy";
const STORAGE_FORMAT = "yyyy-MM-dd"; // ISO, used internally/in APIs

/** Format an ISO date string ("2026-06-01") as "01-06-2026". */
export function toDisplayDate(isoDate: string): string {
  if (!isoDate) return "";
  const parsed = new Date(isoDate);
  if (!isValid(parsed)) return isoDate;
  return format(parsed, DISPLAY_FORMAT);
}

/** Parse a "DD-MM-YYYY" string back into an ISO date string for storage. */
export function fromDisplayDate(displayDate: string): string {
  const parsed = parse(displayDate, DISPLAY_FORMAT, new Date());
  if (!isValid(parsed)) return displayDate;
  return format(parsed, STORAGE_FORMAT);
}

/** Validate a string is a well-formed DD-MM-YYYY date. */
export function isValidDisplayDate(displayDate: string): boolean {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(displayDate)) return false;
  const parsed = parse(displayDate, DISPLAY_FORMAT, new Date());
  return isValid(parsed);
}
