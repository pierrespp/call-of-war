/**
 * Serviço para upload de imagens para o Cloudinary usando a API REST.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export interface CloudinaryResponse {
  secure_url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
}

export const cloudinaryService = {
  /**
   * Faz o upload de um arquivo para o Cloudinary (Unsigned).
   */
  uploadImage: async (file: File): Promise<CloudinaryResponse> => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      throw new Error("Configurações do Cloudinary (Cloud Name ou Upload Preset) ausentes no ambiente.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Erro ao fazer upload para o Cloudinary");
    }

    return await response.json();
  },
};
