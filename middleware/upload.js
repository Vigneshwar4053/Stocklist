// middleware/uploadDisk.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ensure uploads folder exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const name = path.basename(file.originalname, ext).replace(/[^\w\-]/g, '_').slice(0, 40);
    const filename = `${Date.now()}_${name}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB per file (adjust)
  }
});

export default upload;
