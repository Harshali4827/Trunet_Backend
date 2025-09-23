import express from 'express';
import { controlRoomIdValidator, createControlRoomValidator, updateControlRoomValidator } from '../validations/controlRoomValidator.js';
import { createControlRoom, deleteControlRoom, getControlRoomById, getControlRooms, updateControlRoom } from '../controllers/controlRoomController.js';

const router = express.Router();

router.post('/', createControlRoomValidator, createControlRoom);
router.get('/', getControlRooms);
router.get('/:id', controlRoomIdValidator, getControlRoomById);
router.put('/:id', updateControlRoomValidator, updateControlRoom);
router.delete('/:id', controlRoomIdValidator, deleteControlRoom);

export default router;
