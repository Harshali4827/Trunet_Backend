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

     await user.populate('center', 'centerName centerCode centerType');
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

  
    if (!fullName || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: fullName, email, mobile, password',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

  
    if (center) {
      const centerExists = await Center.findById(center);
      if (!centerExists) {
        return res.status(404).json({
          success: false,
          message: 'Center not found',
        });
      }
    }


    if (role) {
      const roleExists = await Role.findById(role);
      if (!roleExists) {
        return res.status(404).json({
          success: false,
          message: 'Role not found',
        });
      }
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
    await user.populate('center', 'centerName centerCode centerType');

   
    createSendToken(user, 201, res);

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
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or mobile already exists',
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

export const getAllUsers = async (req, res) => {
  try {

    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      status,
      role,
      center,
      dateFrom,
      dateTo
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (role && role !== 'all') {
      filter.role = role;
    }

    if (center && center !== 'all') {
      filter.center = center;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.createdAt.$lte = new Date(dateTo);
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const users = await User.find(filter)
      .populate('role', 'roleTitle')
      .populate('center', 'centerName centerCode')
      .select('-password') 
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean(); 

    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limitNum);

    const formattedUsers = users.map(user => ({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      mobile: user.mobile,
      status: user.status,
      role: user.role,
      center: user.center,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    res.status(200).json({
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalUsers,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          nextPage: pageNum < totalPages ? pageNum + 1 : null,
          prevPage: pageNum > 1 ? pageNum - 1 : null
        },
        filters: {
          search: search || '',
          status: status || 'all',
          role: role || 'all',
          center: center || 'all',
          dateFrom: dateFrom || '',
          dateTo: dateTo || ''
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate('role', 'roleTitle')
      .populate({
        path: 'center',
        select: 'centerName centerCode centerType addressLine1 city state',
        populate: [
          { path: 'partner', select: 'partnerName' },
          { path: 'area', select: 'areaName' },
        ],
      })
      .select('-password'); 

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

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
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};



export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      email,
      mobile,
      status,
      role,
      center,
      password,
      confirmPassword,
    } = req.body;
    const user = await User.findById(id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const emailExists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: id } });
      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: 'Email already in use by another user',
        });
      }
    }

    if (mobile && mobile !== user.mobile) {
      const mobileExists = await User.findOne({ mobile, _id: { $ne: id } });
      if (mobileExists) {
        return res.status(409).json({
          success: false,
          message: 'Mobile number already in use by another user',
        });
      }
    }
    if (center) {
      const centerExists = await Center.findById(center);
      if (!centerExists) {
        return res.status(404).json({
          success: false,
          message: 'Center not found',
        });
      }
    }

    if (role) {
      const roleExists = await Role.findById(role);
      if (!roleExists) {
        return res.status(404).json({
          success: false,
          message: 'Role not found',
        });
      }
    }
    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Passwords do not match',
        });
      }

      user.password = password;
      user.confirmPassword = confirmPassword;
    }
    if (fullName) user.fullName = fullName;
    if (email) user.email = email.toLowerCase();
    if (mobile) user.mobile = mobile;
    if (status) user.status = status;
    if (role) user.role = role;
    if (center) user.center = center;

    await user.save();
    await user.populate('role', 'roleTitle');
    await user.populate({
      path: 'center',
      select: 'centerName centerCode centerType addressLine1 city state',
      populate: [
        { path: 'partner', select: 'partnerName' },
        { path: 'area', select: 'areaName' },
      ],
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
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
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};