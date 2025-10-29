import express from "express";
import {
  login,
  register,
  getMe,
  updatePassword,
  getAllUsers,
  logout,
  getUserById,
  updateUser,
  getLoginHistory,
} from "../controllers/authController.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
const MODULE = "Settings";

router.post("/login", login);

router.post("/register", register);
router.get("/me", protect, getMe);

router.get("/", protect, getAllUsers);
router.get("/login-history", protect, getLoginHistory);
router.put(
  "/update-password",
  protect,
  authorizeAccess(MODULE, "manage_user"),
  updatePassword
);
router.post("/logout", protect, logout);

router.get(
  "/user/:id",
  protect,

  getUserById
);
router.put(
  "/user/:id",
  protect,
  authorizeAccess(MODULE, "manage_user"),
  updateUser
);
export default router;
