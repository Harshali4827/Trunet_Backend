// import mongoose from "mongoose";
// import StockUsage from "../models/StockUsage.js";
// import StockRequest from "../models/StockRequest.js";
// import StockTransfer from "../models/StockTransfer.js";
// import StockClosing from "../models/ReportSubmission.js";
// import DamageReturn from "../models/DamageReturn.js";
// import ReplacementRecord from "../models/ReplacementRecord.js";
// import Center from "../models/Center.js";

// export const getUsageSummary = async (req, res) => {
//   try {
//     const { 
//       startDate, 
//       endDate, 
//       centerId, 
//       productId, 
//       month,
//       year,
//       page = 1,
//       limit = 100
//     } = req.query;
    
//     const user = req.user;
//     let dateRange = getDateRange(startDate, endDate, month, year);
    
//     let targetCenters = await getTargetCenters(centerId, user);
    
//     if (!targetCenters || targetCenters.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Center information not found"
//       });
//     }

//     console.log(`Processing data for ${targetCenters.length} centers, productId: ${productId}`);

//     const allCenterData = [];
    
//     for (const center of targetCenters) {
//       console.log(`Processing center: ${center.centerName} (${center._id})`);
      
//       const [
//         stockRequests,
//         stockTransfers,
//         stockUsages,
//         damageReturns,
//         replacementRecords,
//         stockClosings,
//         openingStock
//       ] = await Promise.all([
//         getStockRequestData(center._id, dateRange, productId),
//         getStockTransferData(center._id, dateRange, productId),
//         getStockUsageData(center._id, dateRange, productId),
//         getDamageReturnData(center._id, dateRange, productId),
//         getReplacementRecordData(center._id, dateRange, productId),
//         getStockClosingData(center._id, dateRange, productId),
//         getOpeningStockData(center._id, dateRange.startDate, productId) 
//       ]);
      
//       const usageSummary = processUsageSummary({
//         stockRequests,
//         stockTransfers,
//         stockUsages,
//         damageReturns,
//         replacementRecords,
//         stockClosings,
//         openingStock
//       }, center._id, center, productId);

//       allCenterData.push(...usageSummary);
//     }

//     const currentPage = parseInt(page);
//     const pageSize = parseInt(limit);
//     const startIndex = (currentPage - 1) * pageSize;
//     const endIndex = startIndex + pageSize;
    
//     const paginatedData = allCenterData.slice(startIndex, endIndex);
//     const totalRecords = allCenterData.length;
//     const totalPages = Math.ceil(totalRecords / pageSize);

//     // Prepare filters response
//     const filters = {
//       dateRange: {
//         startDate: dateRange.startDate,
//         endDate: dateRange.endDate
//       },
//       productId,
//       month: month || 'current',
//       year: year || new Date().getFullYear()
//     };
//     if (targetCenters.length === 1) {
//       filters.center = {
//         id: targetCenters[0]._id,
//         name: targetCenters[0].centerName,
//         code: targetCenters[0].centerCode,
//         type: targetCenters[0].centerType
//       };
//     } else {
//       filters.center = {
//         id: 'all',
//         name: 'All Centers',
//         code: 'ALL',
//         type: 'Multiple'
//       };
//     }

//     res.json({
//       success: true,
//       data: paginatedData,
//       pagination: {
//         currentPage,
//         pageSize,
//         totalRecords,
//         totalPages,
//         hasNextPage: currentPage < totalPages,
//         hasPrevPage: currentPage > 1
//       },
//       summary: generateSummaryStats(allCenterData),
//       filters,
//       metadata: {
//         generatedAt: new Date(),
//         recordCount: paginatedData.length,
//         totalQuantity: paginatedData.reduce((sum, item) => sum + getTotalQuantity(item), 0),
//         centersProcessed: targetCenters.length
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

// const getTargetCenters = async (requestedCenterId, user) => {
//   try {
//     if (!requestedCenterId) {
//       const userCenterId = user.center?._id || user.center;
//       if (!userCenterId) {
//         console.log("No user center found");
//         return [];
//       }
//       const center = await Center.findById(userCenterId).select("centerName centerCode centerType");
//       return center ? [center] : [];
//     }

//     if (requestedCenterId === 'all') {
//       console.log("Fetching all centers");
//       return await Center.find({}).select("centerName centerCode centerType");
//     }

//     if (mongoose.Types.ObjectId.isValid(requestedCenterId)) {
//       const center = await Center.findById(requestedCenterId).select("centerName centerCode centerType");
//       if (!center) {
//         console.log(`Center not found with ID: ${requestedCenterId}`);
//         return [];
//       }
//       return [center];
//     }

//     console.log(`Invalid center ID format: ${requestedCenterId}`);
//     return [];
    
//   } catch (error) {
//     console.error("Error in getTargetCenters:", error);
//     return [];
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

//   if (productId) {
//     matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
//   }

//   return await StockRequest.aggregate([
//     { $match: matchStage },
//     { $unwind: "$products" },
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
//         // quantity: "$products.quantity",
//         quantity:"$products.approvedQuantity",
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

//   if (productId) {
//     matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
//   }

//   return await StockTransfer.aggregate([
//     { $match: matchStage },
//     { $unwind: "$products" },
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
//         // quantity: "$products.quantity",
//         quantity:"$products.approvedQuantity",
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
//   if (productId) {
//     matchStage['items.product'] = new mongoose.Types.ObjectId(productId);
//   }

//   const usageData = await StockUsage.aggregate([
//     { $match: matchStage },
//     { $unwind: "$items" },
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
//   if (productId) {
//     matchStage.product = new mongoose.Types.ObjectId(productId);
//   }

//   return await DamageReturn.aggregate([
//     { $match: matchStage },
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
//   if (productId) {
//     matchStage.product = new mongoose.Types.ObjectId(productId);
//   }

//   return await ReplacementRecord.aggregate([
//     { $match: matchStage },
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

//   if (productId) {
//     matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
//   }

//   return await StockClosing.aggregate([
//     { $match: matchStage },
//     { $unwind: "$products" },
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

// const getOpeningStockData = async (centerId, startDate, productId) => {
//   try {
//     const currentStartDate = new Date(startDate);
//     const previousMonthEnd = new Date(currentStartDate);
//     previousMonthEnd.setDate(0); 
//     previousMonthEnd.setHours(23, 59, 59, 999);
    
//     const previousMonthStart = new Date(previousMonthEnd);
//     previousMonthStart.setDate(1);
//     previousMonthStart.setHours(0, 0, 0, 0);

//     console.log(`Looking for previous month closing stock from ${previousMonthStart} to ${previousMonthEnd} for center ${centerId}`);

//     const matchStage = {
//       $or: [
//         { center: new mongoose.Types.ObjectId(centerId) },
//         { closingCenter: new mongoose.Types.ObjectId(centerId) }
//       ],
//       status: { $in: ["Submitted", "Verified"] },
//       date: {
//         $gte: previousMonthStart,
//         $lte: previousMonthEnd
//       }
//     };

//     if (productId) {
//       matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
//     }
//     const previousMonthClosings = await StockClosing.aggregate([
//       { $match: matchStage },
//       { $unwind: "$products" },
//       {
//         $lookup: {
//           from: "products",
//           localField: "products.product",
//           foreignField: "_id",
//           as: "productInfo"
//         }
//       },
//       {
//         $project: {
//           _id: 1,
//           date: 1,
//           product: "$products.product",
//           productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
//           productQty: "$products.productQty",
//           damageQty: "$products.damageQty",
//           totalQty: { $add: ["$products.productQty", "$products.damageQty"] },
//           status: 1
//         }
//       },
//       { $sort: { date: -1 } }
//     ]);

//     const openingDataMap = {};
//     previousMonthClosings.forEach(closing => {
//       const productId = closing.product.toString();
//       if (!openingDataMap[productId] || new Date(closing.date) > new Date(openingDataMap[productId].date)) {
//         openingDataMap[productId] = {
//           product: closing.product,
//           productName: closing.productName,
//           quantity: closing.totalQty,
//           date: closing.date,
//           stockType: "Previous Month Closing"
//         };
//       }
//     });

//     const openingData = Object.values(openingDataMap);

//     console.log(`Found ${openingData.length} products with previous month closing stock`);

//     if (productId && openingData.length === 0) {
//       const product = await mongoose.model("Product").findById(productId).select("productTitle");
//       if (product) {
//         openingData.push({
//           product: productId,
//           productName: product.productTitle,
//           quantity: 0,
//           stockType: "Previous Month Closing",
//           date: previousMonthEnd
//         });
//       }
//     }

//     return openingData;

//   } catch (error) {
//     console.error("Error in getOpeningStockData:", error);
//     return [];
//   }
// };


// // const processUsageSummary = (data, centerId, centerDetails, productId) => {
// //   const allData = [
// //     ...data.stockRequests,
// //     ...data.stockTransfers,
// //     ...data.stockUsages,
// //     ...data.damageReturns,
// //     ...data.replacementRecords,
// //     ...data.stockClosings
// //   ];

// //   const groupedData = {};

// //    data.openingStock.forEach(item => {
// //     if (productId && item.product.toString() !== productId) {
// //       return; 
// //     }
    
// //     if (!groupedData[item.product]) {
// //       groupedData[item.product] = createEmptyProductSummary(item.productName);
// //     }
// //     groupedData[item.product].opening += item.quantity;
// //   });

// //   allData.forEach(item => {
// //     const productIdFromItem = item.product?.toString();
// //     const type = item.type;
    
// //     if (!productIdFromItem) return;

// //     if (productId && productIdFromItem !== productId) {
// //       return;
// //     }

// //     if (!groupedData[productIdFromItem]) {
// //       groupedData[productIdFromItem] = createEmptyProductSummary(
// //         item.productName || 'Unknown Product'
// //       );
// //     }

// //     const quantity = item.quantity || item.qty || item.productQty || 0;
// //     const damageQty = item.damageQty || 0;
// //     if (item.center && !groupedData[productIdFromItem].center) {
// //       groupedData[productIdFromItem].center = {
// //         id: item.center._id,
// //         name: item.center.centerName,
// //         code: item.center.centerCode,
// //         type: item.center.centerType
// //       };
// //     }

// //     switch (type) {
// //       case "Purchase":
// //         groupedData[productIdFromItem].purchase += quantity;
// //         break;
// //       case "Transfer Receive":
// //         groupedData[productIdFromItem].transferReceive += quantity;
// //         break;
// //       case "Transfer Given":
// //         groupedData[productIdFromItem].transferGiven += quantity;
// //         break;
// //       case "Usage":
// //         groupedData[productIdFromItem].usage += quantity;
// //         break;
// //       case "NC":
// //         groupedData[productIdFromItem].nc += quantity;
// //         break;
// //       case "Convert":
// //         groupedData[productIdFromItem].convert += quantity;
// //         break;
// //       case "Shifting":
// //         groupedData[productIdFromItem].shifting += quantity;
// //         break;
// //       case "Building Usage":
// //         groupedData[productIdFromItem].buildingUsage += quantity;
// //         break;
// //       case "Damage":
// //         groupedData[productIdFromItem].damage += quantity;
// //         break;
// //       case "Replace Return":
// //         groupedData[productIdFromItem].replaceReturn += quantity;
// //         break;
// //       case "Replace Damage":
// //         groupedData[productIdFromItem].replaceDamage += quantity;
// //         break;
// //       case "Stolen Center":
// //         groupedData[productIdFromItem].stolenCenter += quantity;
// //         break;
// //       case "Stolen Field":
// //         groupedData[productIdFromItem].stolenField += quantity;
// //         break;
// //       case "Closing":
// //         groupedData[productIdFromItem].closing += (quantity + damageQty);
// //         break;
// //       case "Other":
// //         groupedData[productIdFromItem].other += quantity;
// //         break;
// //       case "Repair":
// //         groupedData[productIdFromItem].repair += quantity;
// //         break;
// //     }
// //   });

// //   const result = Object.values(groupedData).map(item => {
// //     if (!item.center && centerDetails) {
// //       item.center = {
// //         id: centerId,
// //         name: centerDetails.centerName,
// //         code: centerDetails.centerCode,
// //         type: centerDetails.centerType
// //       };
// //     }
// //     if (item.calculateUsageAndClosing) {
// //     item.calculateUsageAndClosing();
// //   }
  
// //     return item;
// //   });

// //   return result;
// // };



// const processUsageSummary = (data, centerId, centerDetails, productId) => {
//   const allData = [
//     ...data.stockRequests,
//     ...data.stockTransfers,
//     ...data.stockUsages,
//     ...data.damageReturns,
//     ...data.replacementRecords,
//     ...data.stockClosings
//   ];

//   const groupedData = {};

//   // Get product IDs from all data sources
//   const allProductIds = new Set();
  
//   // Collect product IDs from opening stock
//   data.openingStock.forEach(item => {
//     if (item.product) {
//       allProductIds.add(item.product.toString());
//     }
//   });
  
//   // Collect product IDs from other data
//   allData.forEach(item => {
//     if (item.product) {
//       allProductIds.add(item.product.toString());
//     }
//   });

//   // Initialize grouped data for each product
//   for (const productIdFromSet of allProductIds) {
//     if (productId && productIdFromSet !== productId) {
//       continue;
//     }
    
//     // Find product name from any data source
//     let productName = 'Unknown Product';
    
//     // Try to find product name from opening stock
//     const openingItem = data.openingStock.find(item => 
//       item.product && item.product.toString() === productIdFromSet
//     );
//     if (openingItem) {
//       productName = openingItem.productName;
//     } else {
//       // Try to find product name from other data
//       const otherItem = allData.find(item => 
//         item.product && item.product.toString() === productIdFromSet
//       );
//       if (otherItem) {
//         productName = otherItem.productName;
//       }
//     }
    
//     groupedData[productIdFromSet] = {
//       productId: productIdFromSet, // Add product ID here
//       productName,
//       opening: 0,
//       purchase: 0,
//       distributed: 0,
//       transferReceive: 0,
//       replaceReturn: 0,
//       usage: 0,
//       transferGiven: 0,
//       nc: 0,
//       convert: 0,
//       shifting: 0,
//       buildingUsage: 0,
//       buildingDamage: 0,
//       other: 0,
//       return: 0,
//       repair: 0,
//       damage: 0,
//       replaceDamage: 0,
//       stolenCenter: 0,
//       stolenField: 0,
//       closing: 0,
//       center: null,
//       calculateUsageAndClosing: function() {
//         this.usage = 
//           this.nc +
//           this.convert +
//           this.shifting +
//           this.buildingUsage +
//           this.buildingDamage +
//           this.other +
//           this.return +
//           this.repair +
//           this.replaceDamage +
//           this.stolenCenter +
//           this.stolenField;
    
//         // Calculate closing stock using previous month's closing as opening
//         this.closing = 
//           this.opening + 
//           this.purchase +
//           this.transferReceive -
//           this.usage -
//           this.transferGiven -
//           this.damage;
    
//         return this.closing;
//       }
//     };
//   }

//   // Now process the data to populate values
//   data.openingStock.forEach(item => {
//     const productIdFromItem = item.product?.toString();
//     if (productId && productIdFromItem !== productId) {
//       return;
//     }
    
//     if (groupedData[productIdFromItem]) {
//       groupedData[productIdFromItem].opening += item.quantity;
//     }
//   });

//   allData.forEach(item => {
//     const productIdFromItem = item.product?.toString();
//     const type = item.type;
    
//     if (!productIdFromItem) return;

//     if (productId && productIdFromItem !== productId) {
//       return;
//     }

//     if (!groupedData[productIdFromItem]) return;

//     const quantity = item.quantity || item.qty || item.productQty || 0;
//     const damageQty = item.damageQty || 0;
    
//     if (item.center && !groupedData[productIdFromItem].center) {
//       groupedData[productIdFromItem].center = {
//         id: item.center._id,
//         name: item.center.centerName,
//         code: item.center.centerCode,
//         type: item.center.centerType
//       };
//     }

//     switch (type) {
//       case "Purchase":
//         groupedData[productIdFromItem].purchase += quantity;
//         break;
//       case "Transfer Receive":
//         groupedData[productIdFromItem].transferReceive += quantity;
//         break;
//       case "Transfer Given":
//         groupedData[productIdFromItem].transferGiven += quantity;
//         break;
//       case "Usage":
//         groupedData[productIdFromItem].usage += quantity;
//         break;
//       case "NC":
//         groupedData[productIdFromItem].nc += quantity;
//         break;
//       case "Convert":
//         groupedData[productIdFromItem].convert += quantity;
//         break;
//       case "Shifting":
//         groupedData[productIdFromItem].shifting += quantity;
//         break;
//       case "Building Usage":
//         groupedData[productIdFromItem].buildingUsage += quantity;
//         break;
//       case "Damage":
//         groupedData[productIdFromItem].damage += quantity;
//         break;
//       case "Replace Return":
//         groupedData[productIdFromItem].replaceReturn += quantity;
//         break;
//       case "Replace Damage":
//         groupedData[productIdFromItem].replaceDamage += quantity;
//         break;
//       case "Stolen Center":
//         groupedData[productIdFromItem].stolenCenter += quantity;
//         break;
//       case "Stolen Field":
//         groupedData[productIdFromItem].stolenField += quantity;
//         break;
//       case "Closing":
//         groupedData[productIdFromItem].closing += (quantity + damageQty);
//         break;
//       case "Other":
//         groupedData[productIdFromItem].other += quantity;
//         break;
//       case "Repair":
//         groupedData[productIdFromItem].repair += quantity;
//         break;
//     }
//   });

//   const result = Object.values(groupedData).map(item => {
//     if (!item.center && centerDetails) {
//       item.center = {
//         id: centerId,
//         name: centerDetails.centerName,
//         code: centerDetails.centerCode,
//         type: centerDetails.centerType
//       };
//     }
    
//     if (item.calculateUsageAndClosing) {
//       item.calculateUsageAndClosing();
//     }
    
//     return item;
//   });

//   return result;
// };

// const createEmptyProductSummary = (productName) => {
//   const summary = {
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
  
//   summary.calculateUsageAndClosing = function() {
//     this.usage = 
//       this.nc +
//       this.convert +
//       this.shifting +
//       this.buildingUsage +
//       this.buildingDamage +
//       this.other +
//       this.return +
//       this.repair +
//       this.replaceDamage +
//       this.stolenCenter +
//       this.stolenField;
  
//     // Calculate closing stock using previous month's closing as opening
//     this.closing = 
//       this.opening + 
//       this.purchase +
//       this.transferReceive -
//       // this.replaceReturn -
//       this.usage -
//       this.transferGiven - 
//       this.damage;
  
//     return this.closing;
//   };

//   return summary;
// };

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


////*************************** added opening stock ************************************/

import mongoose from "mongoose";
import StockUsage from "../models/StockUsage.js";
import StockRequest from "../models/StockRequest.js";
import StockTransfer from "../models/StockTransfer.js";
import StockClosing from "../models/ReportSubmission.js";
import DamageReturn from "../models/DamageReturn.js";
import ReplacementRecord from "../models/ReplacementRecord.js";
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
    
    let targetCenters = await getTargetCenters(centerId, user);
    
    if (!targetCenters || targetCenters.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Center information not found"
      });
    }

    console.log(`Processing data for ${targetCenters.length} centers, productId: ${productId}`);

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
        getOpeningStockData(center._id, dateRange.startDate, productId) 
      ]);
      
      const usageSummary = processUsageSummary({
        stockRequests,
        stockTransfers,
        stockUsages,
        damageReturns,
        replacementRecords,
        stockClosings,
        openingStock
      }, center._id, center, productId);

      allCenterData.push(...usageSummary);
    }

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
    if (!requestedCenterId) {
      const userCenterId = user.center?._id || user.center;
      if (!userCenterId) {
        console.log("No user center found");
        return [];
      }
      const center = await Center.findById(userCenterId).select("centerName centerCode centerType");
      return center ? [center] : [];
    }

    if (requestedCenterId === 'all') {
      console.log("Fetching all centers");
      return await Center.find({}).select("centerName centerCode centerType");
    }

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
  
  // Ensure start date is at beginning of day
  start.setHours(0, 0, 0, 0);
  
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

  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  return await StockRequest.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
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
        // quantity: "$products.quantity",
        quantity:"$products.approvedQuantity",
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

  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  return await StockTransfer.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
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
        // quantity: "$products.quantity",
        quantity:"$products.approvedQuantity",
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
  if (productId) {
    matchStage['items.product'] = new mongoose.Types.ObjectId(productId);
  }

  const usageData = await StockUsage.aggregate([
    { $match: matchStage },
    { $unwind: "$items" },
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

  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  return await StockClosing.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
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
  try {
    const currentStartDate = new Date(startDate);
    
    // Get previous month
    const previousMonthEnd = new Date(currentStartDate);
    previousMonthEnd.setDate(0); // Last day of previous month
    previousMonthEnd.setHours(23, 59, 59, 999);
    
    const previousMonthStart = new Date(previousMonthEnd);
    previousMonthStart.setDate(1);
    previousMonthStart.setHours(0, 0, 0, 0);

    console.log(`========================================`);
    console.log(`Getting opening stock for center: ${centerId}`);
    console.log(`Previous month range: ${previousMonthStart.toISOString()} to ${previousMonthEnd.toISOString()}`);

    // Since we can't find closing records, let's calculate opening from the previous month's transactions
    // This is a fallback approach
    
    // Get all transactions from previous month
    const [
      prevMonthRequests,
      prevMonthTransfers,
      prevMonthUsages,
      prevMonthDamageReturns,
      prevMonthReplacementRecords,
      prevMonthClosings
    ] = await Promise.all([
      getStockRequestData(centerId, { startDate: previousMonthStart, endDate: previousMonthEnd }, productId),
      getStockTransferData(centerId, { startDate: previousMonthStart, endDate: previousMonthEnd }, productId),
      getStockUsageData(centerId, { startDate: previousMonthStart, endDate: previousMonthEnd }, productId),
      getDamageReturnData(centerId, { startDate: previousMonthStart, endDate: previousMonthEnd }, productId),
      getReplacementRecordData(centerId, { startDate: previousMonthStart, endDate: previousMonthEnd }, productId),
      getStockClosingData(centerId, { startDate: previousMonthStart, endDate: previousMonthEnd }, productId)
    ]);

    console.log(`Previous month transactions found:`);
    console.log(`- Stock Requests: ${prevMonthRequests.length}`);
    console.log(`- Stock Transfers: ${prevMonthTransfers.length}`);
    console.log(`- Stock Usages: ${prevMonthUsages.length}`);
    console.log(`- Damage Returns: ${prevMonthDamageReturns.length}`);
    console.log(`- Replacement Records: ${prevMonthReplacementRecords.length}`);
    console.log(`- Stock Closings: ${prevMonthClosings.length}`);

    // Combine all data
    const allPrevMonthData = [
      ...prevMonthRequests,
      ...prevMonthTransfers,
      ...prevMonthUsages,
      ...prevMonthDamageReturns,
      ...prevMonthReplacementRecords,
      ...prevMonthClosings
    ];

    // Group by product
    const productSummary = {};
    
    // Process each transaction
    allPrevMonthData.forEach(item => {
      const productIdFromItem = item.product?.toString();
      const type = item.type;
      
      if (!productIdFromItem) return;
      if (productId && productIdFromItem !== productId) return;

      if (!productSummary[productIdFromItem]) {
        productSummary[productIdFromItem] = {
          product: item.product,
          productName: item.productName || 'Unknown Product',
          opening: 0, // This would be the opening from the month before previous
          purchase: 0,
          transferReceive: 0,
          transferGiven: 0,
          usage: 0,
          damage: 0,
          replaceReturn: 0,
          replaceDamage: 0,
          closing: 0
        };
      }

      const quantity = item.quantity || item.qty || item.productQty || 0;
      const damageQty = item.damageQty || 0;

      switch (type) {
        case "Purchase":
          productSummary[productIdFromItem].purchase += quantity;
          break;
        case "Transfer Receive":
          productSummary[productIdFromItem].transferReceive += quantity;
          break;
        case "Transfer Given":
          productSummary[productIdFromItem].transferGiven += quantity;
          break;
        case "Usage":
        case "NC":
        case "Convert":
        case "Shifting":
        case "Building Usage":
        case "Other":
        case "Repair":
          productSummary[productIdFromItem].usage += quantity;
          break;
        case "Damage":
          productSummary[productIdFromItem].damage += quantity;
          break;
        case "Replace Return":
          productSummary[productIdFromItem].replaceReturn += quantity;
          break;
        case "Replace Damage":
          productSummary[productIdFromItem].replaceDamage += quantity;
          break;
        case "Closing":
          productSummary[productIdFromItem].closing += (quantity + damageQty);
          break;
      }
    });

    // Calculate closing stock for each product (this becomes opening for next month)
    const openingData = Object.values(productSummary).map(item => {
      // Calculate closing stock
      const calculatedClosing = 
        item.opening + 
        item.purchase +
        item.transferReceive -
        item.usage -
        item.transferGiven -
        item.damage;
      
      // Use actual closing if available, otherwise use calculated
      const finalClosing = item.closing > 0 ? item.closing : (calculatedClosing > 0 ? calculatedClosing : 0);
      
      return {
        product: item.product,
        productName: item.productName,
        quantity: finalClosing,
        stockType: "Calculated Previous Month Closing",
        date: previousMonthEnd
      };
    });

    console.log(`Calculated ${openingData.length} products with opening stock`);
    openingData.forEach(item => {
      console.log(`- ${item.productName}: ${item.quantity}`);
    });
    
    console.log(`========================================`);

    return openingData;

  } catch (error) {
    console.error("Error in getOpeningStockData:", error);
    return [];
  }
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

  console.log(`Processing summary for center ${centerId}`);
  console.log(`Opening stock items: ${data.openingStock.length}`);
  console.log(`Current month data items: ${allData.length}`);

  // 1. Process ALL products from opening stock (previous month's closing)
  data.openingStock.forEach(item => {
    const productIdFromItem = item.product?.toString();
    
    if (productId && productIdFromItem !== productId) {
      return;
    }
    
    console.log(`Processing opening stock for product: ${productIdFromItem} - ${item.productName}, Qty: ${item.quantity}`);
    
    if (!groupedData[productIdFromItem]) {
      groupedData[productIdFromItem] = createEmptyProductSummary(item.productName || 'Unknown Product');
      groupedData[productIdFromItem].productId = productIdFromItem;
    }
    
    // Set opening stock
    groupedData[productIdFromItem].opening = item.quantity;
    
    // Set center info
    if (centerDetails && !groupedData[productIdFromItem].center) {
      groupedData[productIdFromItem].center = {
        id: centerId,
        name: centerDetails.centerName,
        code: centerDetails.centerCode,
        type: centerDetails.centerType
      };
    }
  });

  // 2. Process current month transactions
  allData.forEach(item => {
    const productIdFromItem = item.product?.toString();
    const type = item.type;
    
    if (!productIdFromItem) return;
    if (productId && productIdFromItem !== productId) return;

    console.log(`Processing transaction for product: ${productIdFromItem}, Type: ${type}, Qty: ${item.quantity || item.qty || item.productQty || 0}`);

    // Initialize product if it doesn't exist (products with no opening stock)
    if (!groupedData[productIdFromItem]) {
      groupedData[productIdFromItem] = createEmptyProductSummary(
        item.productName || 'Unknown Product'
      );
      groupedData[productIdFromItem].productId = productIdFromItem;
      groupedData[productIdFromItem].opening = 0; // No previous closing
    }

    const quantity = item.quantity || item.qty || item.productQty || 0;
    
    // Set center info if not set
    if (centerDetails && !groupedData[productIdFromItem].center) {
      groupedData[productIdFromItem].center = {
        id: centerId,
        name: centerDetails.centerName,
        code: centerDetails.centerCode,
        type: centerDetails.centerType
      };
    }

    // Map transaction types to summary fields
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
        const damageQty = item.damageQty || 0;
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

  // 3. Process results
  const result = Object.values(groupedData).map(item => {
    // Ensure center info
    if (!item.center && centerDetails) {
      item.center = {
        id: centerId,
        name: centerDetails.centerName,
        code: centerDetails.centerCode,
        type: centerDetails.centerType
      };
    }
    
    // Calculate usage and closing
    if (item.calculateUsageAndClosing) {
      const calculatedClosing = item.calculateUsageAndClosing();
      console.log(`Calculated for ${item.productName}: Opening=${item.opening}, Purchase=${item.purchase}, Closing=${item.closing}`);
    }
    
    return item;
  });

  console.log(`Returning ${result.length} products in summary`);
  return result;
};

const createEmptyProductSummary = (productName) => {
  const summary = {
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
  
  summary.calculateUsageAndClosing = function() {
    this.usage = 
      this.nc +
      this.convert +
      this.shifting +
      this.buildingUsage +
      this.buildingDamage +
      this.other +
      this.return +
      this.repair +
      this.replaceDamage +
      this.stolenCenter +
      this.stolenField;
  
    // Calculate closing stock using previous month's closing as opening
    this.closing = 
      this.opening + 
      this.purchase +
      this.transferReceive -
      // this.replaceReturn -
      this.usage -
      this.transferGiven - 
      this.damage;
  
    return this.closing;
  };

  return summary;
};

const generateSummaryStats = (usageSummary) => {
  const stats = {
    totalProducts: usageSummary.length,
    totalTransactions: usageSummary.reduce((sum, product) => {
      // Filter out non-numeric values and the function
      return sum + Object.entries(product)
        .filter(([key, val]) => key !== 'calculateUsageAndClosing' && typeof val === 'number')
        .reduce((s, [key, v]) => s + v, 0);
    }, 0),
    totalQuantity: usageSummary.reduce((sum, product) => {
      // Exclude productName, center, productId, and the function
      const quantities = { ...product };
      delete quantities.productName;
      delete quantities.center;
      delete quantities.productId;
      delete quantities.calculateUsageAndClosing;
      
      return sum + Object.values(quantities)
        .filter(val => typeof val === 'number')
        .reduce((s, v) => s + v, 0);
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















