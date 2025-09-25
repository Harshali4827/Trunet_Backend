import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import Center from '../models/Center.js';
import Role from '../models/Roles.js';

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  user.password = undefined;
  
  res.status(statusCode).json({
    success: true,
    token,
    data: {
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        status: user.status,
        role: user.role,
        center: user.center,
        lastLogin: user.lastLogin,
      },
    },
  });
};


export const login = async (req, res) => {
  try {
    console.log('Login request body:', req.body);

    const { loginId, email, password } = req.body;
    const identifier = loginId || email;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide login ID (email/mobile) and password',
      });
    }

    const user = await User.findByCredentials(identifier, password);
    createSendToken(user, 200, res);
  } catch (error) {
    console.error('Login error:', error);
    
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

export const register = async (req, res) => {
  try {
    console.log('Registration request body:', req.body);
    
    const { role, center, fullName, email, mobile, password, confirmPassword, status } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    const centerExists = await Center.findById(center);
    if (!centerExists) {
      return res.status(404).json({
        success: false,
        message: 'Center not found',
      });
    }

    const roleExists = await Role.findById(role);
    if (!roleExists) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { mobile }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or mobile already exists',
      });
    }

    const user = new User({
      role,
      center,
      fullName,
      email: email.toLowerCase(),
      mobile,
      password,
      confirmPassword,
      status: status || 'Enable',
    });

    await user.save();

    await user.populate('role', 'roleTitle');
    await user.populate('center', 'centerName centerCode');
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('role', 'roleTitle')
      .populate({
        path: 'center',
        select: 'centerName centerCode centerType addressLine1 city state',
        populate: [
          { path: 'partner', select: 'partnerName' },
          { path: 'area', select: 'areaName' },
        ],
      });

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobile: user.mobile,
          status: user.status,
          role: user.role,
          center: user.center,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match',
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.correctPassword(currentPassword, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    user.confirmPassword = confirmNewPassword;
    await user.save();
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};