// import multer from 'multer';
// import path from 'path';
// import fs from 'fs';

// const uploadsDir = path.join(process.cwd(), 'uploads', 'products');
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir, { recursive: true });
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir);
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     const ext = path.extname(file.originalname);
  
//     let prefix = 'product-';
//     if (req.originalUrl.includes('/challan')) {
//       prefix = 'challan-';
//     } else if (req.originalUrl.includes('/vendor')) {
//       prefix = 'vendor-';
//     }
    
//     cb(null, prefix + uniqueSuffix + ext);
//   }
// });

// const fileFilter = (req, file, cb) => {
//   if (req.originalUrl.includes('/challan')) {
//     if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
//       cb(null, true);
//     } else {
//       cb(new Error('Only image and PDF files are allowed for challan documents!'), false);
//     }
//   } else {
//     if (file.mimetype.startsWith('image/')) {
//       cb(null, true);
//     } else {
//       cb(new Error('Only image files are allowed!'), false);
//     }
//   }
// };

// const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     fileSize: 5 * 1024 * 1024, 
//   }
// });

// export default upload;



import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadsDir = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
  
    let prefix = 'product-';
    if (req.originalUrl.includes('/challan')) {
      prefix = 'challan-';
    } else if (req.originalUrl.includes('/vendor')) {
      prefix = 'vendor-';
    }
    
    cb(null, prefix + uniqueSuffix + ext);
  }
});

const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (req.originalUrl.includes('/bulk-import')) {
    const allowedCSVTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/csv',
      'text/x-csv',
      'application/x-csv',
      'text/comma-separated-values',
      'text/x-comma-separated-values'
    ];
    
    const isCSV = allowedCSVTypes.includes(file.mimetype) || 
                  file.originalname.toLowerCase().endsWith('.csv');
    
    if (isCSV) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed for bulk import!'), false);
    }
  }

  else {
    if (req.originalUrl.includes('/challan')) {
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only image and PDF files are allowed for challan documents!'), false);
      }
    } else {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'), false);
      }
    }
  }
};

export const memoryUpload = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  }
});

export const diskUpload = multer({
  storage: diskStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  }
});

export default diskUpload;