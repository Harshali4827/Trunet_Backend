// import mongoose from "mongoose";
// import StockUsage from "../models/StockUsage.js";
// import StockRequest from "../models/StockRequest.js";
// import StockTransfer from "../models/StockTransfer.js";
// import StockClosing from "../models/ReportSubmission.js";
// import DamageReturn from "../models/DamageReturn.js";
// import ReplacementRecord from "../models/ReplacementRecord.js";
// import CenterStock from "../models/CenterStock.js";
// import OutletStock from "../models/OutletStock.js";
// import Center from "../models/Center.js";

// export const getUsageSummary = async (req, res) => {
//   try {
//     const { 
//       startDate, 
//       endDate, 
//       centerId, 
//       productId, 
//       month,
//       year 
//     } = req.query;
    
//     const user = req.user;
//     let dateRange = getDateRange(startDate, endDate, month, year);
//     let targetCenterId = await getTargetCenterId(centerId, user);
    
//     if (!targetCenterId) {
//       return res.status(400).json({
//         success: false,
//         message: "Center information not found"
//       });
//     }
//     const centerDetails = await Center.findById(targetCenterId).select("centerName centerCode centerType");
//     const [
//       stockRequests,
//       stockTransfers,
//       stockUsages,
//       damageReturns,
//       replacementRecords,
//       stockClosings,
//       openingStock
//     ] = await Promise.all([
//       getStockRequestData(targetCenterId, dateRange, productId),
//       getStockTransferData(targetCenterId, dateRange, productId),
//       getStockUsageData(targetCenterId, dateRange, productId),
//       getDamageReturnData(targetCenterId, dateRange, productId),

//       getReplacementRecordData(targetCenterId, dateRange, productId),

//       getStockClosingData(targetCenterId, dateRange, productId),

//       getOpeningStockData(targetCenterId, dateRange.startDate)
//     ]);
//     const usageSummary = processUsageSummary({
//       stockRequests,
//       stockTransfers,
//       stockUsages,
//       damageReturns,
//       replacementRecords,
//       stockClosings,
//       openingStock
//     }, targetCenterId, centerDetails);

//     res.json({
//       success: true,
//       data: usageSummary,
//       summary: generateSummaryStats(usageSummary),
//       filters: {
//         dateRange: {
//           startDate: dateRange.startDate,
//           endDate: dateRange.endDate
//         },
//         center: {
//           id: targetCenterId,
//           name: centerDetails?.centerName,
//           code: centerDetails?.centerCode,
//           type: centerDetails?.centerType
//         },
//         productId,
//         month: month || 'current',
//         year: year || new Date().getFullYear()
//       },
//       metadata: {
//         generatedAt: new Date(),
//         recordCount: usageSummary.length,
//         totalQuantity: usageSummary.reduce((sum, item) => sum + getTotalQuantity(item), 0)
//       }
//     });

//   } catch (error) {
//     console.error("Get usage summary error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to generate usage summary",
//       error: error.message
//     });
//   }
// };

// const getDateRange = (startDate, endDate, month, year) => {
//   let start, end;
  
//   if (startDate && endDate) {
//     start = new Date(startDate);
//     end = new Date(endDate);
//   } else if (month) {
//     const targetYear = year || new Date().getFullYear();
//     const targetMonth = parseInt(month) - 1;
    
//     start = new Date(targetYear, targetMonth, 1);
//     end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
//   } else {
//     const now = new Date();
//     start = new Date(now.getFullYear(), now.getMonth(), 1);
//     end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
//   }
  
//   return { startDate: start, endDate: end };
// };

// const getTargetCenterId = async (requestedCenterId, user) => {
//   if (requestedCenterId && user.permissions?.view_usage_all_center) {
//     return requestedCenterId;
//   } else {
//     return user.center?._id || user.center;
//   }
// };

// const getStockRequestData = async (centerId, dateRange, productId) => {
//   const matchStage = {
//     $or: [
//       { center: new mongoose.Types.ObjectId(centerId) },
//       { warehouse: new mongoose.Types.ObjectId(centerId) }
//     ],
//     status: { $in: ["Completed", "Confirmed", "Shipped"] },
//     date: {
//       $gte: dateRange.startDate,
//       $lte: dateRange.endDate
//     }
//   };

//   return await StockRequest.aggregate([
//     { $match: matchStage },
//     { $unwind: "$products" },
//     ...(productId ? [{ $match: { "products.product": new mongoose.Types.ObjectId(productId) } }] : []),
//     {
//       $lookup: {
//         from: "products",
//         localField: "products.product",
//         foreignField: "_id",
//         as: "productInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "center",
//         foreignField: "_id",
//         as: "centerInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "warehouse",
//         foreignField: "_id",
//         as: "warehouseInfo"
//       }
//     },
//     {
//       $project: {
//         _id: 1,
//         date: 1,
//         orderNumber: 1,
//         type: "Purchase",
//         center: { $arrayElemAt: ["$centerInfo", 0] },
//         warehouse: { $arrayElemAt: ["$warehouseInfo", 0] },
//         product: "$products.product",
//         productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
//         quantity: "$products.quantity",
//         approvedQuantity: "$products.approvedQuantity",
//         receivedQuantity: "$products.receivedQuantity",
//         status: 1
//       }
//     }
//   ]);
// };

// const getStockTransferData = async (centerId, dateRange, productId) => {
//   const matchStage = {
//     $or: [
//       { fromCenter: new mongoose.Types.ObjectId(centerId) },
//       { toCenter: new mongoose.Types.ObjectId(centerId) }
//     ],
//     status: { $in: ["Completed", "Shipped", "Confirmed"] },
//     date: {
//       $gte: dateRange.startDate,
//       $lte: dateRange.endDate
//     }
//   };

//   return await StockTransfer.aggregate([
//     { $match: matchStage },
//     { $unwind: "$products" },
//     ...(productId ? [{ $match: { "products.product": new mongoose.Types.ObjectId(productId) } }] : []),
//     {
//       $lookup: {
//         from: "products",
//         localField: "products.product",
//         foreignField: "_id",
//         as: "productInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "fromCenter",
//         foreignField: "_id",
//         as: "fromCenterInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "toCenter",
//         foreignField: "_id",
//         as: "toCenterInfo"
//       }
//     },
//     {
//       $project: {
//         _id: 1,
//         date: 1,
//         transferNumber: 1,
//         type: {
//           $cond: {
//             if: { $eq: ["$fromCenter", new mongoose.Types.ObjectId(centerId)] },
//             then: "Transfer Given",
//             else: "Transfer Receive"
//           }
//         },
//         fromCenter: { $arrayElemAt: ["$fromCenterInfo", 0] },
//         toCenter: { $arrayElemAt: ["$toCenterInfo", 0] },
//         product: "$products.product",
//         productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
//         quantity: "$products.quantity",
//         approvedQuantity: "$products.approvedQuantity",
//         receivedQuantity: "$products.receivedQuantity",
//         status: 1
//       }
//     }
//   ]);
// };

// const getStockUsageData = async (centerId, dateRange, productId) => {
//   const matchStage = {
//     center: new mongoose.Types.ObjectId(centerId),
//     status: "completed",
//     date: {
//       $gte: dateRange.startDate,
//       $lte: dateRange.endDate
//     }
//   };

//   const usageData = await StockUsage.aggregate([
//     { $match: matchStage },
//     { $unwind: "$items" },
//     ...(productId ? [{ $match: { "items.product": new mongoose.Types.ObjectId(productId) } }] : []),
//     {
//       $lookup: {
//         from: "products",
//         localField: "items.product",
//         foreignField: "_id",
//         as: "productInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "center",
//         foreignField: "_id",
//         as: "centerInfo"
//       }
//     },
//     {
//       $project: {
//         _id: 1,
//         date: 1,
//         usageType: 1,
//         type: {
//           $switch: {
//             branches: [
//               { case: { $eq: ["$usageType", "Customer"] }, then: "Usage" },
//               { case: { $eq: ["$usageType", "Building"] }, then: "Building Usage" },
//               { case: { $eq: ["$usageType", "Building to Building"] }, then: "Shifting" },
//               { case: { $eq: ["$usageType", "Control Room"] }, then: "Building Usage" },
//               { case: { $eq: ["$usageType", "Damage"] }, then: "Damage" },
//               { case: { $eq: ["$usageType", "Stolen from Center"] }, then: "Stolen Center" },
//               { case: { $eq: ["$usageType", "Stolen from Field"] }, then: "Stolen Field" },
//               { case: { $eq: ["$usageType", "Other"] }, then: "Other" }
//             ],
//             default: "Usage"
//           }
//         },
//         connectionType: 1,
//         center: { $arrayElemAt: ["$centerInfo", 0] },
//         product: "$items.product",
//         productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
//         quantity: "$items.quantity",
//         serialNumbers: "$items.serialNumbers",
//         remark: 1,
//         customer: 1,
//         fromBuilding: 1,
//         toBuilding: 1,
//         fromControlRoom: 1
//       }
//     }
//   ]);

//   // Process connection types for NC, Convert, Shifting
//   return usageData.map(item => {
//     if (item.usageType === "Customer" && item.connectionType) {
//       switch (item.connectionType) {
//         case "NC":
//           item.type = "NC";
//           break;
//         case "Convert":
//           item.type = "Convert";
//           break;
//         case "Shifting":
//           item.type = "Shifting";
//           break;
//         case "Repair":
//           item.type = "Repair";
//           break;
//       }
//     }
//     return item;
//   });
// };

// const getDamageReturnData = async (centerId, dateRange, productId) => {
//   const matchStage = {
//     center: new mongoose.Types.ObjectId(centerId),
//     status: { $in: ["approved", "pending", "replaced"] },
//     date: {
//       $gte: dateRange.startDate,
//       $lte: dateRange.endDate
//     }
//   };

//   return await DamageReturn.aggregate([
//     { $match: matchStage },
//     ...(productId ? [{ $match: { product: new mongoose.Types.ObjectId(productId) } }] : []),
//     {
//       $lookup: {
//         from: "products",
//         localField: "product",
//         foreignField: "_id",
//         as: "productInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "center",
//         foreignField: "_id",
//         as: "centerInfo"
//       }
//     },
//     {
//       $project: {
//         _id: 1,
//         date: 1,
//         type: "Replace Return",
//         center: { $arrayElemAt: ["$centerInfo", 0] },
//         product: 1,
//         productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
//         quantity: 1,
//         serialNumber: 1,
//         status: 1,
//         remark: 1
//       }
//     }
//   ]);
// };

// const getReplacementRecordData = async (centerId, dateRange, productId) => {
//   const matchStage = {
//     center: new mongoose.Types.ObjectId(centerId),
//     date: {
//       $gte: dateRange.startDate,
//       $lte: dateRange.endDate
//     }
//   };

//   return await ReplacementRecord.aggregate([
//     { $match: matchStage },
//     ...(productId ? [{ $match: { product: new mongoose.Types.ObjectId(productId) } }] : []),
//     {
//       $lookup: {
//         from: "products",
//         localField: "product",
//         foreignField: "_id",
//         as: "productInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "center",
//         foreignField: "_id",
//         as: "centerInfo"
//       }
//     },
//     {
//       $project: {
//         _id: 1,
//         date: 1,
//         type: "Replace Damage",
//         center: { $arrayElemAt: ["$centerInfo", 0] },
//         product: 1,
//         productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
//         qty: 1,
//         oldSerialNumber: 1,
//         newSerialNumber: 1,
//         statusReason: 1
//       }
//     }
//   ]);
// };

// const getStockClosingData = async (centerId, dateRange, productId) => {
//   const matchStage = {
//     $or: [
//       { center: new mongoose.Types.ObjectId(centerId) },
//       { closingCenter: new mongoose.Types.ObjectId(centerId) }
//     ],
//     status: { $in: ["Submitted", "Verified"] },
//     date: {
//       $gte: dateRange.startDate,
//       $lte: dateRange.endDate
//     }
//   };

//   return await StockClosing.aggregate([
//     { $match: matchStage },
//     { $unwind: "$products" },
//     ...(productId ? [{ $match: { "products.product": new mongoose.Types.ObjectId(productId) } }] : []),
//     {
//       $lookup: {
//         from: "products",
//         localField: "products.product",
//         foreignField: "_id",
//         as: "productInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "center",
//         foreignField: "_id",
//         as: "centerInfo"
//       }
//     },
//     {
//       $lookup: {
//         from: "centers",
//         localField: "closingCenter",
//         foreignField: "_id",
//         as: "closingCenterInfo"
//       }
//     },
//     {
//       $project: {
//         _id: 1,
//         date: 1,
//         type: "Closing",
//         center: { $arrayElemAt: ["$centerInfo", 0] },
//         closingCenter: { $arrayElemAt: ["$closingCenterInfo", 0] },
//         product: "$products.product",
//         productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
//         productQty: "$products.productQty",
//         damageQty: "$products.damageQty",
//         status: 1
//       }
//     }
//   ]);
// };

// const getOpeningStockData = async (centerId, startDate) => {
//   const openingDate = new Date(startDate);
//   openingDate.setDate(openingDate.getDate() - 1);
  
//   const [centerStock, outletStock] = await Promise.all([
//     CenterStock.find({ 
//       center: centerId 
//     }).populate("product", "productTitle productCode"),
    
//     OutletStock.find({ 
//       outlet: centerId 
//     }).populate("product", "productTitle productCode")
//   ]);

//   const openingData = [];

//   centerStock.forEach(stock => {
//     openingData.push({
//       product: stock.product._id,
//       productName: stock.product.productTitle,
//       quantity: stock.availableQuantity,
//       stockType: "Center"
//     });
//   });
//   outletStock.forEach(stock => {
//     openingData.push({
//       product: stock.product._id,
//       productName: stock.product.productTitle,
//       quantity: stock.availableQuantity,
//       stockType: "Outlet"
//     });
//   });

//   return openingData;
// };

// const processUsageSummary = (data, centerId, centerDetails) => {
//   const allData = [
//     ...data.stockRequests,
//     ...data.stockTransfers,
//     ...data.stockUsages,
//     ...data.damageReturns,
//     ...data.replacementRecords,
//     ...data.stockClosings
//   ];

//   const groupedData = {};

//   data.openingStock.forEach(item => {
//     if (!groupedData[item.product]) {
//       groupedData[item.product] = createEmptyProductSummary(item.productName);
//     }
//     groupedData[item.product].opening += item.quantity;
//   });

//   allData.forEach(item => {
//     const productId = item.product?.toString();
//     const type = item.type;
    
//     if (!productId) return;

//     if (!groupedData[productId]) {
//       groupedData[productId] = createEmptyProductSummary(
//         item.productName || 'Unknown Product'
//       );
//     }

//     const quantity = item.quantity || item.qty || item.productQty || 0;
//     const damageQty = item.damageQty || 0;
//     if (item.center && !groupedData[productId].center) {
//       groupedData[productId].center = {
//         id: item.center._id,
//         name: item.center.centerName,
//         code: item.center.centerCode,
//         type: item.center.centerType
//       };
//     }

//     switch (type) {
//       case "Purchase":
//         groupedData[productId].purchase += quantity;
//         break;
//       case "Transfer Receive":
//         groupedData[productId].transferReceive += quantity;
//         break;
//       case "Transfer Given":
//         groupedData[productId].transferGiven += quantity;
//         break;
//       case "Usage":
//         groupedData[productId].usage += quantity;
//         break;
//       case "NC":
//         groupedData[productId].nc += quantity;
//         break;
//       case "Convert":
//         groupedData[productId].convert += quantity;
//         break;
//       case "Shifting":
//         groupedData[productId].shifting += quantity;
//         break;
//       case "Building Usage":
//         groupedData[productId].buildingUsage += quantity;
//         break;
//       case "Damage":
//         groupedData[productId].damage += quantity;
//         break;
//       case "Replace Return":
//         groupedData[productId].replaceReturn += quantity;
//         break;
//       case "Replace Damage":
//         groupedData[productId].replaceDamage += quantity;
//         break;
//       case "Stolen Center":
//         groupedData[productId].stolenCenter += quantity;
//         break;
//       case "Stolen Field":
//         groupedData[productId].stolenField += quantity;
//         break;
//       case "Closing":
//         groupedData[productId].closing += (quantity + damageQty);
//         break;
//       case "Other":
//         groupedData[productId].other += quantity;
//         break;
//       case "Repair":
//         groupedData[productId].repair += quantity;
//         break;
//     }
//   });

//   // Add center details if missing
//   const result = Object.values(groupedData).map(item => {
//     if (!item.center && centerDetails) {
//       item.center = {
//         id: centerId,
//         name: centerDetails.centerName,
//         code: centerDetails.centerCode,
//         type: centerDetails.centerType
//       };
//     }
//     return item;
//   });

//   return result;
// };

// const createEmptyProductSummary = (productName) => {
//   return {
//     productName,
//     opening: 0,
//     purchase: 0,
//     distributed: 0,
//     transferReceive: 0,
//     replaceReturn: 0,
//     usage: 0,
//     transferGiven: 0,
//     nc: 0,
//     convert: 0,
//     shifting: 0,
//     buildingUsage: 0,
//     buildingDamage: 0,
//     other: 0,
//     return: 0,
//     repair: 0,
//     damage: 0,
//     replaceDamage: 0,
//     stolenCenter: 0,
//     stolenField: 0,
//     closing: 0,
//     center: null
//   };
// };

// // Generate summary statistics
// const generateSummaryStats = (usageSummary) => {
//   const stats = {
//     totalProducts: usageSummary.length,
//     totalTransactions: usageSummary.reduce((sum, product) => {
//       return sum + Object.values(product).filter(val => typeof val === 'number').reduce((s, v) => s + v, 0);
//     }, 0),
//     totalQuantity: usageSummary.reduce((sum, product) => {
//       const quantities = { ...product };
//       delete quantities.product;
//       delete quantities.productName;
//       delete quantities.center;
//       return sum + Object.values(quantities).reduce((s, v) => s + v, 0);
//     }, 0),
//     centers: [...new Set(usageSummary.map(item => item.center?.name).filter(Boolean))]
//   };

//   return stats;
// };

// const getTotalQuantity = (item) => {
//   const quantities = { ...item };
//   delete quantities.product;
//   delete quantities.productName;
//   delete quantities.center;
//   return Object.values(quantities).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
// };



import mongoose from "mongoose";
import StockUsage from "../models/StockUsage.js";
import StockRequest from "../models/StockRequest.js";
import StockTransfer from "../models/StockTransfer.js";
import StockClosing from "../models/ReportSubmission.js";
import DamageReturn from "../models/DamageReturn.js";
import ReplacementRecord from "../models/ReplacementRecord.js";
import CenterStock from "../models/CenterStock.js";
import OutletStock from "../models/OutletStock.js";
import Center from "../models/Center.js";

export const getUsageSummary = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      centerId, 
      productId, 
      month,
      year,
      page = 1,
      limit = 100
    } = req.query;
    
    const user = req.user;
    let dateRange = getDateRange(startDate, endDate, month, year);
    
    // Get target centers based on filter
    let targetCenters = await getTargetCenters(centerId, user);
    
    if (!targetCenters || targetCenters.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Center information not found"
      });
    }

    console.log(`Processing data for ${targetCenters.length} centers, productId: ${productId}`);

    // Fetch data for all target centers
    const allCenterData = [];
    
    for (const center of targetCenters) {
      console.log(`Processing center: ${center.centerName} (${center._id})`);
      
      const [
        stockRequests,
        stockTransfers,
        stockUsages,
        damageReturns,
        replacementRecords,
        stockClosings,
        openingStock
      ] = await Promise.all([
        getStockRequestData(center._id, dateRange, productId),
        getStockTransferData(center._id, dateRange, productId),
        getStockUsageData(center._id, dateRange, productId),
        getDamageReturnData(center._id, dateRange, productId),
        getReplacementRecordData(center._id, dateRange, productId),
        getStockClosingData(center._id, dateRange, productId),
        getOpeningStockData(center._id, dateRange.startDate, productId) // Added productId here too
      ]);
      
      const usageSummary = processUsageSummary({
        stockRequests,
        stockTransfers,
        stockUsages,
        damageReturns,
        replacementRecords,
        stockClosings,
        openingStock
      }, center._id, center, productId); // Added productId here

      allCenterData.push(...usageSummary);
    }

    // Pagination logic
    const currentPage = parseInt(page);
    const pageSize = parseInt(limit);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    const paginatedData = allCenterData.slice(startIndex, endIndex);
    const totalRecords = allCenterData.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // Prepare filters response
    const filters = {
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      },
      productId,
      month: month || 'current',
      year: year || new Date().getFullYear()
    };

    // If single center, include center details in filters
    if (targetCenters.length === 1) {
      filters.center = {
        id: targetCenters[0]._id,
        name: targetCenters[0].centerName,
        code: targetCenters[0].centerCode,
        type: targetCenters[0].centerType
      };
    } else {
      filters.center = {
        id: 'all',
        name: 'All Centers',
        code: 'ALL',
        type: 'Multiple'
      };
    }

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage,
        pageSize,
        totalRecords,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      },
      summary: generateSummaryStats(allCenterData),
      filters,
      metadata: {
        generatedAt: new Date(),
        recordCount: paginatedData.length,
        totalQuantity: paginatedData.reduce((sum, item) => sum + getTotalQuantity(item), 0),
        centersProcessed: targetCenters.length
      }
    });

  } catch (error) {
    console.error("Get usage summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate usage summary",
      error: error.message
    });
  }
};

const getTargetCenters = async (requestedCenterId, user) => {
  try {
    // If no centerId provided, default to user's center
    if (!requestedCenterId) {
      const userCenterId = user.center?._id || user.center;
      if (!userCenterId) {
        console.log("No user center found");
        return [];
      }
      const center = await Center.findById(userCenterId).select("centerName centerCode centerType");
      return center ? [center] : [];
    }

    // If centerId is "all", return all centers
    if (requestedCenterId === 'all') {
      console.log("Fetching all centers");
      return await Center.find({}).select("centerName centerCode centerType");
    }

    // If specific centerId is provided
    if (mongoose.Types.ObjectId.isValid(requestedCenterId)) {
      const center = await Center.findById(requestedCenterId).select("centerName centerCode centerType");
      if (!center) {
        console.log(`Center not found with ID: ${requestedCenterId}`);
        return [];
      }
      return [center];
    }

    console.log(`Invalid center ID format: ${requestedCenterId}`);
    return [];
    
  } catch (error) {
    console.error("Error in getTargetCenters:", error);
    return [];
  }
};

const getDateRange = (startDate, endDate, month, year) => {
  let start, end;
  
  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else if (month) {
    const targetYear = year || new Date().getFullYear();
    const targetMonth = parseInt(month) - 1;
    
    start = new Date(targetYear, targetMonth, 1);
    end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  
  return { startDate: start, endDate: end };
};

const getStockRequestData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { warehouse: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["Completed", "Confirmed", "Shipped"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  // Add product filter to match stage if productId is provided
  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  return await StockRequest.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    // Remove the separate product match stage since we're now filtering in the main match
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "warehouse",
        foreignField: "_id",
        as: "warehouseInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        orderNumber: 1,
        type: "Purchase",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        warehouse: { $arrayElemAt: ["$warehouseInfo", 0] },
        product: "$products.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: "$products.quantity",
        approvedQuantity: "$products.approvedQuantity",
        receivedQuantity: "$products.receivedQuantity",
        status: 1
      }
    }
  ]);
};

const getStockTransferData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { fromCenter: new mongoose.Types.ObjectId(centerId) },
      { toCenter: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["Completed", "Shipped", "Confirmed"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  // Add product filter to match stage if productId is provided
  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  return await StockTransfer.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    // Remove the separate product match stage since we're now filtering in the main match
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "fromCenter",
        foreignField: "_id",
        as: "fromCenterInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "toCenter",
        foreignField: "_id",
        as: "toCenterInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        transferNumber: 1,
        type: {
          $cond: {
            if: { $eq: ["$fromCenter", new mongoose.Types.ObjectId(centerId)] },
            then: "Transfer Given",
            else: "Transfer Receive"
          }
        },
        fromCenter: { $arrayElemAt: ["$fromCenterInfo", 0] },
        toCenter: { $arrayElemAt: ["$toCenterInfo", 0] },
        product: "$products.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: "$products.quantity",
        approvedQuantity: "$products.approvedQuantity",
        receivedQuantity: "$products.receivedQuantity",
        status: 1
      }
    }
  ]);
};

const getStockUsageData = async (centerId, dateRange, productId) => {
  const matchStage = {
    center: new mongoose.Types.ObjectId(centerId),
    status: "completed",
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  // Add product filter to match stage if productId is provided
  if (productId) {
    matchStage['items.product'] = new mongoose.Types.ObjectId(productId);
  }

  const usageData = await StockUsage.aggregate([
    { $match: matchStage },
    { $unwind: "$items" },
    // Remove the separate product match stage since we're now filtering in the main match
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        usageType: 1,
        type: {
          $switch: {
            branches: [
              { case: { $eq: ["$usageType", "Customer"] }, then: "Usage" },
              { case: { $eq: ["$usageType", "Building"] }, then: "Building Usage" },
              { case: { $eq: ["$usageType", "Building to Building"] }, then: "Shifting" },
              { case: { $eq: ["$usageType", "Control Room"] }, then: "Building Usage" },
              { case: { $eq: ["$usageType", "Damage"] }, then: "Damage" },
              { case: { $eq: ["$usageType", "Stolen from Center"] }, then: "Stolen Center" },
              { case: { $eq: ["$usageType", "Stolen from Field"] }, then: "Stolen Field" },
              { case: { $eq: ["$usageType", "Other"] }, then: "Other" }
            ],
            default: "Usage"
          }
        },
        connectionType: 1,
        center: { $arrayElemAt: ["$centerInfo", 0] },
        product: "$items.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: "$items.quantity",
        serialNumbers: "$items.serialNumbers",
        remark: 1,
        customer: 1,
        fromBuilding: 1,
        toBuilding: 1,
        fromControlRoom: 1
      }
    }
  ]);

  // Process connection types for NC, Convert, Shifting
  return usageData.map(item => {
    if (item.usageType === "Customer" && item.connectionType) {
      switch (item.connectionType) {
        case "NC":
          item.type = "NC";
          break;
        case "Convert":
          item.type = "Convert";
          break;
        case "Shifting":
          item.type = "Shifting";
          break;
        case "Repair":
          item.type = "Repair";
          break;
      }
    }
    return item;
  });
};

const getDamageReturnData = async (centerId, dateRange, productId) => {
  const matchStage = {
    center: new mongoose.Types.ObjectId(centerId),
    status: { $in: ["approved", "pending", "replaced"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  // Add product filter to match stage if productId is provided
  if (productId) {
    matchStage.product = new mongoose.Types.ObjectId(productId);
  }

  return await DamageReturn.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Replace Return",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        product: 1,
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: 1,
        serialNumber: 1,
        status: 1,
        remark: 1
      }
    }
  ]);
};

const getReplacementRecordData = async (centerId, dateRange, productId) => {
  const matchStage = {
    center: new mongoose.Types.ObjectId(centerId),
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  // Add product filter to match stage if productId is provided
  if (productId) {
    matchStage.product = new mongoose.Types.ObjectId(productId);
  }

  return await ReplacementRecord.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Replace Damage",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        product: 1,
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        qty: 1,
        oldSerialNumber: 1,
        newSerialNumber: 1,
        statusReason: 1
      }
    }
  ]);
};

const getStockClosingData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { closingCenter: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["Submitted", "Verified"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  // Add product filter to match stage if productId is provided
  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  return await StockClosing.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    // Remove the separate product match stage since we're now filtering in the main match
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "closingCenter",
        foreignField: "_id",
        as: "closingCenterInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Closing",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        closingCenter: { $arrayElemAt: ["$closingCenterInfo", 0] },
        product: "$products.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        productQty: "$products.productQty",
        damageQty: "$products.damageQty",
        status: 1
      }
    }
  ]);
};

const getOpeningStockData = async (centerId, startDate, productId) => {
  const openingDate = new Date(startDate);
  openingDate.setDate(openingDate.getDate() - 1);
  
  // Build query for center stock
  const centerStockQuery = { center: centerId };
  if (productId) {
    centerStockQuery.product = productId;
  }
  
  // Build query for outlet stock
  const outletStockQuery = { outlet: centerId };
  if (productId) {
    outletStockQuery.product = productId;
  }

  const [centerStock, outletStock] = await Promise.all([
    CenterStock.find(centerStockQuery).populate("product", "productTitle productCode"),
    OutletStock.find(outletStockQuery).populate("product", "productTitle productCode")
  ]);

  const openingData = [];

  centerStock.forEach(stock => {
    openingData.push({
      product: stock.product._id,
      productName: stock.product.productTitle,
      quantity: stock.availableQuantity,
      stockType: "Center"
    });
  });
  outletStock.forEach(stock => {
    openingData.push({
      product: stock.product._id,
      productName: stock.product.productTitle,
      quantity: stock.availableQuantity,
      stockType: "Outlet"
    });
  });

  return openingData;
};

const processUsageSummary = (data, centerId, centerDetails, productId) => {
  const allData = [
    ...data.stockRequests,
    ...data.stockTransfers,
    ...data.stockUsages,
    ...data.damageReturns,
    ...data.replacementRecords,
    ...data.stockClosings
  ];

  const groupedData = {};

  // Only process opening stock for the filtered product if productId is provided
  data.openingStock.forEach(item => {
    if (productId && item.product.toString() !== productId) {
      return; // Skip if product filter is applied and doesn't match
    }
    
    if (!groupedData[item.product]) {
      groupedData[item.product] = createEmptyProductSummary(item.productName);
    }
    groupedData[item.product].opening += item.quantity;
  });

  allData.forEach(item => {
    const productIdFromItem = item.product?.toString();
    const type = item.type;
    
    if (!productIdFromItem) return;

    // If product filter is applied, skip items that don't match
    if (productId && productIdFromItem !== productId) {
      return;
    }

    if (!groupedData[productIdFromItem]) {
      groupedData[productIdFromItem] = createEmptyProductSummary(
        item.productName || 'Unknown Product'
      );
    }

    const quantity = item.quantity || item.qty || item.productQty || 0;
    const damageQty = item.damageQty || 0;
    if (item.center && !groupedData[productIdFromItem].center) {
      groupedData[productIdFromItem].center = {
        id: item.center._id,
        name: item.center.centerName,
        code: item.center.centerCode,
        type: item.center.centerType
      };
    }

    switch (type) {
      case "Purchase":
        groupedData[productIdFromItem].purchase += quantity;
        break;
      case "Transfer Receive":
        groupedData[productIdFromItem].transferReceive += quantity;
        break;
      case "Transfer Given":
        groupedData[productIdFromItem].transferGiven += quantity;
        break;
      case "Usage":
        groupedData[productIdFromItem].usage += quantity;
        break;
      case "NC":
        groupedData[productIdFromItem].nc += quantity;
        break;
      case "Convert":
        groupedData[productIdFromItem].convert += quantity;
        break;
      case "Shifting":
        groupedData[productIdFromItem].shifting += quantity;
        break;
      case "Building Usage":
        groupedData[productIdFromItem].buildingUsage += quantity;
        break;
      case "Damage":
        groupedData[productIdFromItem].damage += quantity;
        break;
      case "Replace Return":
        groupedData[productIdFromItem].replaceReturn += quantity;
        break;
      case "Replace Damage":
        groupedData[productIdFromItem].replaceDamage += quantity;
        break;
      case "Stolen Center":
        groupedData[productIdFromItem].stolenCenter += quantity;
        break;
      case "Stolen Field":
        groupedData[productIdFromItem].stolenField += quantity;
        break;
      case "Closing":
        groupedData[productIdFromItem].closing += (quantity + damageQty);
        break;
      case "Other":
        groupedData[productIdFromItem].other += quantity;
        break;
      case "Repair":
        groupedData[productIdFromItem].repair += quantity;
        break;
    }
  });

  // Add center details if missing
  const result = Object.values(groupedData).map(item => {
    if (!item.center && centerDetails) {
      item.center = {
        id: centerId,
        name: centerDetails.centerName,
        code: centerDetails.centerCode,
        type: centerDetails.centerType
      };
    }
    return item;
  });

  return result;
};

const createEmptyProductSummary = (productName) => {
  return {
    productName,
    opening: 0,
    purchase: 0,
    distributed: 0,
    transferReceive: 0,
    replaceReturn: 0,
    usage: 0,
    transferGiven: 0,
    nc: 0,
    convert: 0,
    shifting: 0,
    buildingUsage: 0,
    buildingDamage: 0,
    other: 0,
    return: 0,
    repair: 0,
    damage: 0,
    replaceDamage: 0,
    stolenCenter: 0,
    stolenField: 0,
    closing: 0,
    center: null
  };
};

// Generate summary statistics
const generateSummaryStats = (usageSummary) => {
  const stats = {
    totalProducts: usageSummary.length,
    totalTransactions: usageSummary.reduce((sum, product) => {
      return sum + Object.values(product).filter(val => typeof val === 'number').reduce((s, v) => s + v, 0);
    }, 0),
    totalQuantity: usageSummary.reduce((sum, product) => {
      const quantities = { ...product };
      delete quantities.product;
      delete quantities.productName;
      delete quantities.center;
      return sum + Object.values(quantities).reduce((s, v) => s + v, 0);
    }, 0),
    centers: [...new Set(usageSummary.map(item => item.center?.name).filter(Boolean))]
  };

  return stats;
};

const getTotalQuantity = (item) => {
  const quantities = { ...item };
  delete quantities.product;
  delete quantities.productName;
  delete quantities.center;
  return Object.values(quantities).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
};