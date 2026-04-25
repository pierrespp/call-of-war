import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getImageUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("data:")) return path;
  if (path.startsWith("http")) return path;
  const base = import.meta.env.BASE_URL || "/";
  // Evita barras duplas, ex se base for / e path for /maps/...
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
