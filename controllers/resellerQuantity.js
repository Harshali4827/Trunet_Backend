
import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import mongoose from "mongoose";

const checkStockRequestPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const indentModule = userPermissions.find((perm) => perm.module === "Indent");

  if (!indentModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_indent: indentModule.permissions.includes("manage_indent"),
    indent_all_center: indentModule.permissions.includes("indent_all_center"),
    indent_own_center: indentModule.permissions.includes("indent_own_center"),
    delete_indent_all_center: indentModule.permissions.includes(
      "delete_indent_all_center"
    ),
    delete_indent_own_center: indentModule.permissions.includes(
      "delete_indent_own_center"
    ),
    stock_transfer_approve_from_outlet: indentModule.permissions.includes(
      "stock_transfer_approve_from_outlet"
    ),
    complete_indent: indentModule.permissions.includes("complete_indent"),
  };

  const hasRequiredPermission = requiredPermissions.some(
    (perm) => permissions[perm]
  );

  return {
    hasAccess: hasRequiredPermission,
    permissions,
    userCenter: req.user.center,
  };
};


// export const getResellerForwardedQty = async (req, res) => {
//     try {
//       const { hasAccess, permissions } = checkStockRequestPermissions(
//         req,
//         ["indent_all_center", "indent_own_center"]
//       );
  
//       if (!hasAccess) {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied. Required permissions missing.",
//         });
//       }
  
//       const {
//         page = 1,
//         limit = 50,
//         startDate,
//         endDate,
//         resellerId,
//         center: centerId, // Add center filter parameter
//         status = "Completed",
//         search,
//         export: isExport = false,
//       } = req.query;
  
//       // Helper function to parse DD-MM-YYYY format
//       const parseDate = (dateStr) => {
//         if (!dateStr) return null;
        
//         const parts = dateStr.split('-');
//         if (parts.length === 3) {
//           const day = parseInt(parts[0], 10);
//           const month = parseInt(parts[1], 10) - 1;
//           const year = parseInt(parts[2], 10);
          
//           if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
//             return new Date(year, month, day);
//           }
//         }
        
//         return new Date(dateStr);
//       };
  
//       // Build date filter
//       const dateFilter = {};
//       if (startDate || endDate) {
//         dateFilter.date = {};
        
//         if (startDate) {
//           const start = parseDate(startDate);
//           if (isNaN(start.getTime())) {
//             return res.status(400).json({
//               success: false,
//               message: "Invalid start date format. Please use DD-MM-YYYY format",
//             });
//           }
//           start.setHours(0, 0, 0, 0);
//           dateFilter.date.$gte = start;
//         }
        
//         if (endDate) {
//           const end = parseDate(endDate);
//           if (isNaN(end.getTime())) {
//             return res.status(400).json({
//               success: false,
//               message: "Invalid end date format. Please use DD-MM-YYYY format",
//             });
//           }
//           end.setHours(23, 59, 59, 999);
//           dateFilter.date.$lte = end;
//         }
//       }
  
//       // Build status filter
//       const statusFilter = status ? { status } : {};
  
//       // First, get all centers with their reseller info
//       let centerQuery = { centerType: "Center" };
      
//       // If center filter is provided, add it to the center query
//       if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
//         centerQuery._id = centerId;
//       }
      
//       const centers = await Center.find(centerQuery)
//         .populate("reseller", "businessName name email mobile")
//         .select("_id centerName centerCode reseller");
  
//       // Create maps for organizing data
//       const centerToResellerMap = new Map();
//       const resellerMap = new Map();
  
//       centers.forEach(center => {
//         if (center.reseller) {
//           const resId = center.reseller._id.toString();
//           centerToResellerMap.set(center._id.toString(), {
//             resellerId: resId,
//             resellerName: center.reseller.businessName || center.reseller.name,
//             resellerEmail: center.reseller.email,
//             resellerMobile: center.reseller.mobile,
//             centerName: center.centerName,
//             centerCode: center.centerCode,
//           });
  
//           if (!resellerMap.has(resId)) {
//             resellerMap.set(resId, {
//               resellerId: resId,
//               resellerName: center.reseller.businessName || center.reseller.name,
//               resellerEmail: center.reseller.email,
//               resellerMobile: center.reseller.mobile,
//               products: {},
//             });
//           }
//         }
//       });
  
//       // Get all center IDs that match our criteria
//       let centerIds = [...centerToResellerMap.keys()];
      
//       // Apply reseller filter if provided
//       if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
//         centerIds = centerIds.filter(centerId => {
//           const resellerInfo = centerToResellerMap.get(centerId);
//           return resellerInfo && resellerInfo.resellerId === resellerId;
//         });
//       }
      
//       // Apply center filter is already applied in the center query above
  
//       if (centerIds.length === 0) {
//         const emptyResponse = {
//           success: true,
//           message: "No centers found",
//           data: [],
//           filters: {
//             dateRange: startDate || endDate ? { startDate, endDate } : null,
//             status,
//             resellerId: resellerId || null,
//             centerId: centerId || null,
//             search: search || null,
//           },
//         };
  
//         if (!isExport) {
//           emptyResponse.pagination = {
//             currentPage: parseInt(page),
//             totalPages: 0,
//             totalItems: 0,
//             itemsPerPage: parseInt(limit),
//             hasNext: false,
//             hasPrev: false,
//           };
//         }
  
//         return res.status(200).json(emptyResponse);
//       }
  
//       // Build stock request query
//       const stockRequestQuery = {
//         center: { $in: centerIds.map(id => new mongoose.Types.ObjectId(id)) },
//         ...statusFilter,
//         ...dateFilter,
//       };
  
//       console.log("Stock request query:", JSON.stringify(stockRequestQuery, null, 2));
  
//       // Get total count for pagination
//       const totalStockRequests = await StockRequest.countDocuments(stockRequestQuery);
  
//       if (totalStockRequests === 0) {
//         // Even with no stock requests, return resellers with empty products
//         const result = Array.from(resellerMap.values())
//           .map(reseller => ({
//             resellerId: reseller.resellerId,
//             resellerName: reseller.resellerName,
//             resellerEmail: reseller.resellerEmail,
//             products: [],
//           }));
  
//         const pageNum = parseInt(page);
//         const limitNum = parseInt(limit);
//         const startIndex = (pageNum - 1) * limitNum;
//         const endIndex = startIndex + limitNum;
//         const paginatedResult = result.slice(startIndex, endIndex);
  
//         const pagination = {
//           currentPage: pageNum,
//           totalPages: Math.ceil(result.length / limitNum),
//           totalItems: result.length,
//           itemsPerPage: limitNum,
//           hasNext: pageNum < Math.ceil(result.length / limitNum),
//           hasPrev: pageNum > 1,
//         };
  
//         return res.status(200).json({
//           success: true,
//           message: "No stock requests found for the criteria",
//           data: isExport ? result : paginatedResult,
//           ...(isExport ? {} : { pagination }),
//           filters: {
//             dateRange: startDate || endDate ? { startDate, endDate } : null,
//             status,
//             resellerId: resellerId || null,
//             centerId: centerId || null,
//             search: search || null,
//           },
//         });
//       }
  
//       // Get stock requests with pagination
//       let stockRequestsQuery = StockRequest.find(stockRequestQuery)
//         .populate("products.product", "productTitle productCode")
//         .populate("center", "centerName centerCode")
//         .lean();
  
//       // Apply pagination only if not exporting
//       if (!isExport) {
//         const pageNum = parseInt(page);
//         const limitNum = parseInt(limit);
//         const skip = (pageNum - 1) * limitNum;
//         stockRequestsQuery = stockRequestsQuery.skip(skip).limit(limitNum);
//       }
  
//       const stockRequests = await stockRequestsQuery;
  
//       // Process each stock request
//       for (const request of stockRequests) {
//         const centerId = request.center?._id?.toString();
//         const resellerInfo = centerToResellerMap.get(centerId);
        
//         if (!resellerInfo || !request.products) continue;
  
//         const resellerData = resellerMap.get(resellerInfo.resellerId);
//         if (!resellerData) continue;
        
//         for (const product of request.products) {
//           const productId = product.product?._id?.toString();
//           const productName = product.product?.productTitle || "Unknown Product";
//           const productCode = product.product?.productCode || "";
//           const receivedQty = product.receivedQuantity || 0;
  
//           if (receivedQty === 0) continue;
  
//           // Apply search filter
//           if (search) {
//             const searchLower = search.toLowerCase();
//             const matchesSearch = 
//               (resellerInfo.resellerName && resellerInfo.resellerName.toLowerCase().includes(searchLower)) ||
//               (productName.toLowerCase().includes(searchLower)) ||
//               (productCode.toLowerCase().includes(searchLower));
            
//             if (!matchesSearch) continue;
//           }
  
//           if (productId) {
//             if (!resellerData.products[productId]) {
//               resellerData.products[productId] = {
//                 productId,
//                 productName,
//                 productCode,
//                 totalForwardedQty: 0,
//                 orderCount: 0,
//                 centers: {},
//               };
//             }
//             resellerData.products[productId].totalForwardedQty += receivedQty;
//             resellerData.products[productId].orderCount += 1;
  
//             if (!resellerData.products[productId].centers[centerId]) {
//               resellerData.products[productId].centers[centerId] = {
//                 centerId,
//                 centerName: resellerInfo.centerName,
//                 centerCode: resellerInfo.centerCode,
//                 forwardedQty: 0,
//               };
//             }
//             resellerData.products[productId].centers[centerId].forwardedQty += receivedQty;
//           }
//         }
//       }
  
//       // Prepare final result
//       let result = Array.from(resellerMap.values())
//         .map(reseller => {
//           const productsList = Object.values(reseller.products)
//             .map(product => ({
//               ...product,
//               centers: Object.values(product.centers).sort((a, b) => b.forwardedQty - a.forwardedQty),
//             }))
//             .sort((a, b) => b.totalForwardedQty - a.totalForwardedQty);
  
//           return {
//             resellerId: reseller.resellerId,
//             resellerName: reseller.resellerName,
//             resellerEmail: reseller.resellerEmail,
//             products: productsList,
//           };
//         })
//         .filter(reseller => reseller.products.length > 0);
  
//       // Calculate total items for pagination
//       const totalItems = result.length;
  
//       // If exporting, return all data without pagination
//       if (isExport) {
//         return res.status(200).json({
//           success: true,
//           message: "Resellers forwarded quantity exported successfully",
//           data: result,
//           filters: {
//             dateRange: startDate || endDate ? { startDate, endDate } : null,
//             status,
//             resellerId: resellerId || null,
//             centerId: centerId || null,
//             search: search || null,
//           },
//         });
//       }
  
//       // For regular requests, return paginated data
//       const pageNum = parseInt(page);
//       const limitNum = parseInt(limit);
//       const startIndex = (pageNum - 1) * limitNum;
//       const endIndex = startIndex + limitNum;
//       const paginatedResult = result.slice(startIndex, endIndex);
  
//       const pagination = {
//         currentPage: pageNum,
//         totalPages: Math.ceil(totalItems / limitNum),
//         totalItems: totalItems,
//         itemsPerPage: limitNum,
//         hasNext: pageNum < Math.ceil(totalItems / limitNum),
//         hasPrev: pageNum > 1,
//       };
  
//       // If filtering by a specific reseller, return just that reseller's data
//       if (resellerId && paginatedResult.length === 1) {
//         return res.status(200).json({
//           success: true,
//           message: "Reseller forwarded quantity retrieved successfully",
//           data: paginatedResult[0],
//           pagination,
//           filters: {
//             dateRange: startDate || endDate ? { startDate, endDate } : null,
//             status,
//             resellerId,
//             centerId: centerId || null,
//             search: search || null,
//           },
//         });
//       }
  
//       res.status(200).json({
//         success: true,
//         message: "Resellers forwarded quantity retrieved successfully",
//         data: paginatedResult,
//         pagination,
//         filters: {
//           dateRange: startDate || endDate ? { startDate, endDate } : null,
//           status,
//           resellerId: resellerId || null,
//           centerId: centerId || null,
//           search: search || null,
//         },
//       });
  
//     } catch (error) {
//       console.error("Error getting reseller forwarded quantity:", error);
//       res.status(500).json({
//         success: false,
//         message: "Error retrieving reseller forwarded quantity",
//         error: error.message,
//       });
//     }
// };


export const getResellerForwardedQty = async (req, res) => {
    try {
      const { hasAccess, permissions } = checkStockRequestPermissions(
        req,
        ["indent_all_center", "indent_own_center"]
      );
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permissions missing.",
        });
      }
  
      const {
        page = 1,
        limit = 50,
        startDate,
        endDate,
        resellerId,
        center: centerId,
        product: productId, // Add product filter parameter
        status = "Completed",
        search,
        export: isExport = false,
      } = req.query;
  
      // Helper function to parse DD-MM-YYYY format
      const parseDate = (dateStr) => {
        if (!dateStr) return null;
        
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            return new Date(year, month, day);
          }
        }
        
        return new Date(dateStr);
      };
  
      // Build date filter
      const dateFilter = {};
      if (startDate || endDate) {
        dateFilter.date = {};
        
        if (startDate) {
          const start = parseDate(startDate);
          if (isNaN(start.getTime())) {
            return res.status(400).json({
              success: false,
              message: "Invalid start date format. Please use DD-MM-YYYY format",
            });
          }
          start.setHours(0, 0, 0, 0);
          dateFilter.date.$gte = start;
        }
        
        if (endDate) {
          const end = parseDate(endDate);
          if (isNaN(end.getTime())) {
            return res.status(400).json({
              success: false,
              message: "Invalid end date format. Please use DD-MM-YYYY format",
            });
          }
          end.setHours(23, 59, 59, 999);
          dateFilter.date.$lte = end;
        }
      }
  
      // Build status filter
      const statusFilter = status ? { status } : {};
  
      // First, get all centers with their reseller info
      let centerQuery = { centerType: "Center" };
      
      // If center filter is provided, add it to the center query
      if (centerId && mongoose.Types.ObjectId.isValid(centerId)) {
        centerQuery._id = centerId;
      }
      
      const centers = await Center.find(centerQuery)
        .populate("reseller", "businessName name email mobile")
        .select("_id centerName centerCode reseller");
  
      // Create maps for organizing data
      const centerToResellerMap = new Map();
      const resellerMap = new Map();
  
      centers.forEach(center => {
        if (center.reseller) {
          const resId = center.reseller._id.toString();
          centerToResellerMap.set(center._id.toString(), {
            resellerId: resId,
            resellerName: center.reseller.businessName || center.reseller.name,
            resellerEmail: center.reseller.email,
            resellerMobile: center.reseller.mobile,
            centerName: center.centerName,
            centerCode: center.centerCode,
          });
  
          if (!resellerMap.has(resId)) {
            resellerMap.set(resId, {
              resellerId: resId,
              resellerName: center.reseller.businessName || center.reseller.name,
              resellerEmail: center.reseller.email,
              resellerMobile: center.reseller.mobile,
              products: {},
            });
          }
        }
      });
  
      // Get all center IDs that match our criteria
      let centerIds = [...centerToResellerMap.keys()];
      
      // Apply reseller filter if provided
      if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
        centerIds = centerIds.filter(centerId => {
          const resellerInfo = centerToResellerMap.get(centerId);
          return resellerInfo && resellerInfo.resellerId === resellerId;
        });
      }
  
      if (centerIds.length === 0) {
        const emptyResponse = {
          success: true,
          message: "No centers found",
          data: [],
          filters: {
            dateRange: startDate || endDate ? { startDate, endDate } : null,
            status,
            resellerId: resellerId || null,
            centerId: centerId || null,
            productId: productId || null,
            search: search || null,
          },
        };
  
        if (!isExport) {
          emptyResponse.pagination = {
            currentPage: parseInt(page),
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: parseInt(limit),
            hasNext: false,
            hasPrev: false,
          };
        }
  
        return res.status(200).json(emptyResponse);
      }
  
      // Build stock request query
      const stockRequestQuery = {
        center: { $in: centerIds.map(id => new mongoose.Types.ObjectId(id)) },
        ...statusFilter,
        ...dateFilter,
      };
  
      // If product filter is provided, add it to the query
      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        stockRequestQuery['products.product'] = new mongoose.Types.ObjectId(productId);
      }
  
      console.log("Stock request query:", JSON.stringify(stockRequestQuery, null, 2));
  
      // Get total count for pagination
      const totalStockRequests = await StockRequest.countDocuments(stockRequestQuery);
  
      if (totalStockRequests === 0) {
        // Even with no stock requests, return resellers with empty products
        const result = Array.from(resellerMap.values())
          .map(reseller => ({
            resellerId: reseller.resellerId,
            resellerName: reseller.resellerName,
            resellerEmail: reseller.resellerEmail,
            products: [],
          }));
  
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedResult = result.slice(startIndex, endIndex);
  
        const pagination = {
          currentPage: pageNum,
          totalPages: Math.ceil(result.length / limitNum),
          totalItems: result.length,
          itemsPerPage: limitNum,
          hasNext: pageNum < Math.ceil(result.length / limitNum),
          hasPrev: pageNum > 1,
        };
  
        return res.status(200).json({
          success: true,
          message: "No stock requests found for the criteria",
          data: isExport ? result : paginatedResult,
          ...(isExport ? {} : { pagination }),
          filters: {
            dateRange: startDate || endDate ? { startDate, endDate } : null,
            status,
            resellerId: resellerId || null,
            centerId: centerId || null,
            productId: productId || null,
            search: search || null,
          },
        });
      }
  
      // Get stock requests with pagination
      let stockRequestsQuery = StockRequest.find(stockRequestQuery)
        .populate("products.product", "productTitle productCode")
        .populate("center", "centerName centerCode")
        .lean();
  
      // Apply pagination only if not exporting
      if (!isExport) {
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        stockRequestsQuery = stockRequestsQuery.skip(skip).limit(limitNum);
      }
  
      const stockRequests = await stockRequestsQuery;
  
      // Process each stock request
      for (const request of stockRequests) {
        const centerId = request.center?._id?.toString();
        const resellerInfo = centerToResellerMap.get(centerId);
        
        if (!resellerInfo || !request.products) continue;
  
        const resellerData = resellerMap.get(resellerInfo.resellerId);
        if (!resellerData) continue;
        
        for (const product of request.products) {
          const productId = product.product?._id?.toString();
          const productName = product.product?.productTitle || "Unknown Product";
          const productCode = product.product?.productCode || "";
          const receivedQty = product.receivedQuantity || 0;
  
          if (receivedQty === 0) continue;
  
          // Apply search filter
          if (search) {
            const searchLower = search.toLowerCase();
            const matchesSearch = 
              (resellerInfo.resellerName && resellerInfo.resellerName.toLowerCase().includes(searchLower)) ||
              (productName.toLowerCase().includes(searchLower)) ||
              (productCode.toLowerCase().includes(searchLower));
            
            if (!matchesSearch) continue;
          }
  
          if (productId) {
            if (!resellerData.products[productId]) {
              resellerData.products[productId] = {
                productId,
                productName,
                productCode,
                totalForwardedQty: 0,
                orderCount: 0,
                centers: {},
              };
            }
            resellerData.products[productId].totalForwardedQty += receivedQty;
            resellerData.products[productId].orderCount += 1;
  
            if (!resellerData.products[productId].centers[centerId]) {
              resellerData.products[productId].centers[centerId] = {
                centerId,
                centerName: resellerInfo.centerName,
                centerCode: resellerInfo.centerCode,
                forwardedQty: 0,
              };
            }
            resellerData.products[productId].centers[centerId].forwardedQty += receivedQty;
          }
        }
      }
  
      // Prepare final result
      let result = Array.from(resellerMap.values())
        .map(reseller => {
          let productsList = Object.values(reseller.products)
            .map(product => ({
              ...product,
              centers: Object.values(product.centers).sort((a, b) => b.forwardedQty - a.forwardedQty),
            }))
            .sort((a, b) => b.totalForwardedQty - a.totalForwardedQty);
  
          // If product filter is applied, filter the products list
          if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productsList = productsList.filter(p => p.productId === productId);
          }
  
          return {
            resellerId: reseller.resellerId,
            resellerName: reseller.resellerName,
            resellerEmail: reseller.resellerEmail,
            products: productsList,
          };
        })
        .filter(reseller => reseller.products.length > 0);
  
      // Calculate total items for pagination
      const totalItems = result.length;
  
      // If exporting, return all data without pagination
      if (isExport) {
        return res.status(200).json({
          success: true,
          message: "Resellers forwarded quantity exported successfully",
          data: result,
          filters: {
            dateRange: startDate || endDate ? { startDate, endDate } : null,
            status,
            resellerId: resellerId || null,
            centerId: centerId || null,
            productId: productId || null,
            search: search || null,
          },
        });
      }
  
      // For regular requests, return paginated data
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedResult = result.slice(startIndex, endIndex);
  
      const pagination = {
        currentPage: pageNum,
        totalPages: Math.ceil(totalItems / limitNum),
        totalItems: totalItems,
        itemsPerPage: limitNum,
        hasNext: pageNum < Math.ceil(totalItems / limitNum),
        hasPrev: pageNum > 1,
      };
  
      // If filtering by a specific reseller, return just that reseller's data
      if (resellerId && paginatedResult.length === 1) {
        return res.status(200).json({
          success: true,
          message: "Reseller forwarded quantity retrieved successfully",
          data: paginatedResult[0],
          pagination,
          filters: {
            dateRange: startDate || endDate ? { startDate, endDate } : null,
            status,
            resellerId,
            centerId: centerId || null,
            productId: productId || null,
            search: search || null,
          },
        });
      }
  
      res.status(200).json({
        success: true,
        message: "Resellers forwarded quantity retrieved successfully",
        data: paginatedResult,
        pagination,
        filters: {
          dateRange: startDate || endDate ? { startDate, endDate } : null,
          status,
          resellerId: resellerId || null,
          centerId: centerId || null,
          productId: productId || null,
          search: search || null,
        },
      });
  
    } catch (error) {
      console.error("Error getting reseller forwarded quantity:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving reseller forwarded quantity",
        error: error.message,
      });
    }
  };