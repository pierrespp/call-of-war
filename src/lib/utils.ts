import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getImageUrl(path: string) {
  if (!path) return "";
  if (
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }
  const base =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL)
      ? import.meta.env.BASE_URL
      : (typeof process !== "undefined" && process.env && process.env.VITE_BASE_PATH)
        ? process.env.VITE_BASE_PATH
        : "/";
  const cleanBase = base.replace(/\/$/, "");

  // Se o caminho já inclui o base path (ex: /call-of-war/tiles/...), evita duplicações
  if (cleanBase && (path === cleanBase || path.startsWith(`${cleanBase}/`))) {
    return path;
  }

  const cleanPath = path.replace(/^\//, "");
  return cleanBase ? `${cleanBase}/${cleanPath}` : `/${cleanPath}`;
}

/**
 * Compresses a base64 image string to ensure it's under a certain dimension/size.
 * Helps avoid 413 Payload Too Large errors from the server/proxy.
 */
export async function compressBase64Image(
  base64: string,
  maxWidth = 2048,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = (err) => reject(err);
    img.src = base64;
  });
}
