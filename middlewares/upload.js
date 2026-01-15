// import multer from 'multer';

// const storage = multer.memoryStorage();

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = [
//     'application/vnd.ms-excel',
//     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
//     'text/csv',
//     'application/octet-stream'
//   ];
  
//   const allowedExtensions = ['.xls', '.xlsx', '.csv'];
//   const fileExtension = file.originalname.toLowerCase().substring(
//     file.originalname.lastIndexOf('.')
//   );

//   if (allowedTypes.includes(file.mimetype) || 
//       allowedExtensions.includes(fileExtension)) {
//     cb(null, true);
//   } else {
//     cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'), false);
//   }
// };

// const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     fileSize: 200 * 1024 * 1024,
//   }
// });

// export default upload;



import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/csv");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".csv"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024 
  }
});

export default upload;
