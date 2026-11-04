import { type UploadMediaFn } from "@storyteller/api";
import { UploaderStates } from "@storyteller/common";

/** Reads a file into a `data:` URL without sending it anywhere. */
export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Upload stand-in for BytePlus models: the image stays on this machine and
 * the "media token" is its data URL, which the BytePlus backend accepts.
 */
export const keepImageLocal: UploadMediaFn = async ({
  assetFile,
  progressCallback,
}) => {
  progressCallback({ status: UploaderStates.uploadingImage });
  try {
    const data = await fileToDataUrl(assetFile);
    progressCallback({ status: UploaderStates.success, data });
  } catch {
    progressCallback({
      status: UploaderStates.imageCreateError,
      errorMessage: "Could not read image!",
    });
  }
};

/**
 * The image value a BytePlus request needs: a data URL for anything the user
 * picked from disk (even if it was uploaded before the model switch), else
 * the stored token as-is (a library pick).
 */
export const localImageSource = async (image: {
  file: File;
  mediaToken: string;
}): Promise<string> => {
  if (image.mediaToken.startsWith("data:")) return image.mediaToken;
  if (image.file.size > 0) return fileToDataUrl(image.file);
  return image.mediaToken;
};
