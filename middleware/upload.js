// middleware/upload.js
import multer from 'multer';
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB/file limit
export default upload;
