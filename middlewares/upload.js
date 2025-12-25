import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/octet-stream'
  ];
  
  const allowedExtensions = ['.xls', '.xlsx', '.csv'];
  const fileExtension = file.originalname.toLowerCase().substring(
    file.originalname.lastIndexOf('.')
  );

  if (allowedTypes.includes(file.mimetype) || 
      allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

export default upload;