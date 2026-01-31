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
  deleteUser,
  selectCenter,
  switchCenter,
  refreshToken,
} from "../controllers/authController.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";
import { verifyCenterSelectToken } from "../middlewares/centerSelectionMiddleware.js";

const router = express.Router();
const MODULE = "Settings";

router.post("/login", login);

router.post("/register", register);
router.post('/select-center',verifyCenterSelectToken, selectCenter);

router.get("/me", protect, getMe);

router.get("/", protect, getAllUsers);
router.get("/login-history", protect, getLoginHistory);
router.get("/refresh-token",refreshToken);

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
router.post('/switch-center', protect, switchCenter);
router.delete(
  "/user/:id",
  protect,
  authorizeAccess(MODULE, "manage_user"),
  deleteUser
)
export default router;
