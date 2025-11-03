import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const DEFAULT_UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || 'hsbc-disputes';

const cloudinaryConfigured = Boolean(
  CLOUDINARY_CLOUD_NAME &&
  CLOUDINARY_API_KEY &&
  CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
} else {
  console.warn('⚠️ Cloudinary environment variables not set; defaulting to local file storage');
}

export const isCloudinaryConfigured = (): boolean => cloudinaryConfigured;

export interface UploadOptions {
  folder?: string;
}

export interface UploadedAsset {
  publicId: string;
  secureUrl: string;
  bytes: number;
  format: string;
  resourceType: string;
}

export const uploadToCloudinary = (
  file: Express.Multer.File,
  options: UploadOptions = {}
): Promise<UploadedAsset> => {
  if (!cloudinaryConfigured) {
    return Promise.reject(new Error('Cloudinary is not configured.')); 
  }

  if (!file || !file.buffer) {
    return Promise.reject(new Error('Invalid file buffer supplied for Cloudinary upload.'));
  }

  const folder = options.folder || DEFAULT_UPLOAD_FOLDER;

  return new Promise<UploadedAsset>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        overwrite: false,
        unique_filename: true
      },
      (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(new Error('No result returned from Cloudinary.'));
        }

        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          bytes: result.bytes,
          format: result.format,
          resourceType: result.resource_type
        });
      }
    );

    uploadStream.end(file.buffer);
  });
};
