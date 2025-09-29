import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import errorHandler from './middlewares/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import partnerRoutes from './routes/partnerRoutes.js';
import areaRoutes from './routes/areaRoutes.js';
import centerRooutes from './routes/centerRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import buildingRoutes from './routes/buildingRoutes.js';
import controlRoomRoutes from './routes/controlRoomRoutes.js';
import productCategoryRoutes from './routes/productCategoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import packageDuration from './routes/packageDurationRoutes.js';
import wareHouse from './routes/warehouseRoutes.js';
import stockRequest from './routes/stockRequestRoutes.js'
import userRoles from './routes/roleRoutes.js'
import stockPurchase from './routes/stockPurchaseRoutes.js'
import stockTransfer from './routes/stockTransferRoutes.js'
dotenv.config();
connectDB();

const app = express();

app.use(express.json());
app.use(cors({ origin: ['http://localhost:3000',"http://localhost:3001"], credentials: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(helmet());
// app.use(mongoSanitize());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use(limiter);

app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/centers', centerRooutes);
app.use('/api/customers', customerRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/controlRooms', controlRoomRoutes);
app.use('/api/product-category', productCategoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/packageDuration', packageDuration);
app.use('/api/warehouse', wareHouse);
app.use('/api/stockrequest', stockRequest);
app.use('/api/role', userRoles);
app.use('/api/stockpurchase', stockPurchase);
app.use('/api/stocktransfer', stockTransfer);
app.use(errorHandler);

export default app;
