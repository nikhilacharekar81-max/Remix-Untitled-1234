import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

const configuredBucketName = process.env.GCS_BUCKET_NAME || process.env.CLOUD_STORAGE_BUCKET;
const bucketName = configuredBucketName || 'workperhour-uploads-bucket';
const storage = new Storage();
const bucket = storage.bucket(bucketName);

function assertProductionBucketConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !configuredBucketName) {
    throw new Error('Cloud storage configuration missing: GCS_BUCKET_NAME or CLOUD_STORAGE_BUCKET must be set in production.');
  }
}

export async function uploadFileToCloudStorage(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
  const safeFilename = path.basename(filename);
  const isTestOrLocal = process.env.NODE_ENV === 'test' || (!configuredBucketName && !process.env.GOOGLE_CLOUD_PROJECT && process.env.NODE_ENV !== 'production');
  
  if (isTestOrLocal) {
    const localDir = path.join(process.cwd(), 'data', 'uploads', 'workstream');
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, safeFilename);
    fs.writeFileSync(localPath, buffer);
    return `/uploads/workstream/${safeFilename}`;
  }

  assertProductionBucketConfigured();

  try {
    const file = bucket.file(`workstream/${safeFilename}`);
    await file.save(buffer, {
      contentType: mimeType,
      resumable: false,
    });
    return `https://storage.googleapis.com/${bucketName}/workstream/${safeFilename}`;
  } catch (err) {
    console.error('[CloudStorage ERROR] Failed to upload file to GCS:', err);
    throw err;
  }
}

export async function deleteFileFromCloudStorage(filename: string): Promise<void> {
  const safeFilename = path.basename(filename);
  const isTestOrLocal = process.env.NODE_ENV === 'test' || (!configuredBucketName && !process.env.GOOGLE_CLOUD_PROJECT && process.env.NODE_ENV !== 'production');
  if (isTestOrLocal) {
    const localPath = path.join(process.cwd(), 'data', 'uploads', 'workstream', safeFilename);
    try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
    return;
  }

  assertProductionBucketConfigured();

  try {
    const file = bucket.file(`workstream/${safeFilename}`);
    await file.delete({ ignoreNotFound: true });
  } catch (err) {
    console.error('[CloudStorage ERROR] Failed to delete file from GCS:', err);
  }
}

export function openCloudFileStream(
  filename: string,
  authUser?: any,
  checkAccess?: (user: any, filename: string) => boolean
) {
  assertProductionBucketConfigured();
  const safeFilename = path.basename(filename);
  if (checkAccess && (!authUser || !checkAccess(authUser, safeFilename))) {
    throw new Error('Unauthorized file access');
  }
  return bucket.file(`workstream/${safeFilename}`).createReadStream();
}

