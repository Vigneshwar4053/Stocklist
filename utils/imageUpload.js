// utils/imageUpload.js  (or inside your controller file)
import fs from 'fs';
import imagekit from '../lib/imagekit.js';

export async function uploadFilePathToImageKit(filepath, originalname, folder = '/products') {
  try {
    const stream = fs.createReadStream(filepath);
    const fileName = originalname || filepath.split('/').pop();
    const res = await imagekit.upload({
      file: stream,
      fileName,
      folder
    });
    // res.url usually contains the CDN url
    return res?.url || res?.filePath || null;
  } catch (err) {
    console.error('uploadFilePathToImageKit error:', err && err.message ? err.message : err);
    return null;
  }
}
