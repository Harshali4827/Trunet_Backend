import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import errorHandler from './middlewares/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import partnerRoutes from './routes/partnerRoutes.js';
import areaRoutes from './routes/areaRoutes.js';
import centerRooutes from './routes/centerRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import buildingRoutes from './routes/buildingRoutes.js';
import controlRoomRoutes from './routes/controlRoomRoutes.js'
dotenv.config();
connectDB();

const app = express();

// Middlewares
app.use(express.json());
app.use(cors({ origin: ['http://localhost:3000',"http://localhost:3001"], credentials: true }));

app.use(helmet());
// app.use(mongoSanitize());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/centers', centerRooutes);
app.use('/api/customers', customerRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/controlRooms', controlRoomRoutes);

app.use(errorHandler);

export default app;
