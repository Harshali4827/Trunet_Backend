
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import StockRequest from '../models/StockRequest.js';

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

const checkCenterAccess = (stockRequest, userCenter, permissions) => {
    if (permissions.indent_all_center) {
      return true;
    }
  
    if (permissions.indent_own_center && userCenter) {
      const userCenterId = userCenter._id || userCenter;
      const requestCenterId = stockRequest.center._id || stockRequest.center;
      return userCenterId.toString() === requestCenterId.toString();
    }
  
    return false;
  };

export const markAsInvoiced = async (req, res) => {
    try {
      const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
        req,
        ["manage_indent"]
      );
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. manage_indent permission required.",
        });
      }
  
      const { 
        stockRequestIds, 
        invoiceNumber, 
        invoiceDate,
        invoiceData
      } = req.body;
  
      if (!stockRequestIds || !Array.isArray(stockRequestIds) || stockRequestIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Stock request IDs are required",
        });
      }
  
      if (!invoiceNumber || invoiceNumber.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Invoice number is required",
        });
      }
  
      const userId = req.user?.id;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User authentication required",
        });
      }
  
      // Get all stock requests to validate
      const stockRequests = await StockRequest.find({
        _id: { $in: stockRequestIds }
      })
      .populate("center", "_id centerName centerCode reseller")
      .populate("products.product", "_id productTitle hsnCode salePrice");
  
      // Validate each stock request
      const validationErrors = [];
      const validStockRequests = [];
  
      for (const request of stockRequests) {
        // Check access
        if (!checkCenterAccess(request, userCenter, permissions)) {
          validationErrors.push({
            stockRequestId: request._id,
            orderNumber: request.orderNumber,
            error: `Access denied. You cannot invoice stock requests from center: ${request.center?.centerName || 'Unknown'}`
          });
          continue;
        }
  
        // Check if already invoiced
        if (request.invoiceInfo?.invoiceRaised) {
          validationErrors.push({
            stockRequestId: request._id,
            orderNumber: request.orderNumber,
            error: `Already invoiced with invoice: ${request.invoiceInfo.invoiceNumber}`
          });
          continue;
        }
  
        // Check if status is Completed
        if (request.status !== "Completed") {
          validationErrors.push({
            stockRequestId: request._id,
            orderNumber: request.orderNumber,
            error: `Cannot invoice. Status must be "Completed", current status: ${request.status}`
          });
          continue;
        }
  
        validStockRequests.push(request);
      }
  
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed for some stock requests",
          errors: validationErrors
        });
      }
  
      if (validStockRequests.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid stock requests to invoice"
        });
      }
  
      // Extract reseller from first stock request (all should have same reseller)
      const firstRequest = validStockRequests[0];
      const resellerId = firstRequest.center?.reseller?._id || firstRequest.center?.reseller;
      
      if (!resellerId) {
        return res.status(400).json({
          success: false,
          message: "Reseller information not found for the selected stock requests"
        });
      }
  
      // Extract centers
      const centers = [...new Set(validStockRequests.map(req => req.center._id))];
  
      // Calculate centers list string
      const centerNames = [...new Set(validStockRequests.map(req => req.center?.centerName).filter(Boolean))];
      const centersList = centerNames.join(', ');
  
      // Prepare products data for invoice storage
      const productsForInvoice = invoiceData?.products || [];
      
      // Prepare HSN summary for invoice storage
      const hsnSummaryForInvoice = invoiceData?.hsnSummary || [];
  
      // Get metadata from request or use defaults
      const metadata = invoiceData?.metadata || {
        deliveryNote: '',
        modeOfPayment: '',
        referenceNo: '',
        otherReferences: '',
        buyerOrderNo: '',
        dispatchDocNo: '',
        dispatchedThrough: '',
        destination: centersList || 'All Alpha Area',
        termsOfDelivery: ''
      };
  
      try {
        // 1. Create Invoice document
        const invoice = new Invoice({
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          stockRequestIds: validStockRequests.map(req => req._id),
          reseller: resellerId,
          centers: centers,
          products: productsForInvoice,
          totalOutletAmount: invoiceData?.totalOutletAmount || 0,
          totalDamageRepairAmount: invoiceData?.totalDamageRepairAmount || 0,
          totalCenterReturnAmount: invoiceData?.totalCenterReturnAmount || 0,
          totalBeforeTax: invoiceData?.totalBeforeTax || 0,
          cgst: invoiceData?.cgst || 0,
          sgst: invoiceData?.sgst || 0,
          roundOff: invoiceData?.roundOff || 0,
          totalAmount: invoiceData?.total || 0,
          metadata: metadata,
          hsnSummary: hsnSummaryForInvoice,
          invoiceHtml: invoiceData?.invoiceHtml || '',
          status: 'generated',
          createdBy: userId,
          createdAt: new Date()
        });
  
        await invoice.save();
  
        // 2. Update all stock requests with invoice info
        const updatePromises = validStockRequests.map(stockRequest => 
          StockRequest.findByIdAndUpdate(
            stockRequest._id,
            {
              $set: {
                "invoiceInfo.invoiceRaised": true,
                "invoiceInfo.invoiceNumber": invoiceNumber.trim(),
                "invoiceInfo.invoiceDate": invoiceDate ? new Date(invoiceDate) : new Date(),
                "invoiceInfo.invoiceRaisedAt": new Date(),
                "invoiceInfo.invoiceRaisedBy": userId,
                "invoiceInfo.invoiceId": invoice._id,
                updatedBy: userId
              }
            },
            { new: true }
          )
        );
  
        await Promise.all(updatePromises);
  
        // Populate invoice for response
        const populatedInvoice = await Invoice.findById(invoice._id)
          .populate('reseller', 'businessName gstNumber address1 address2 city state')
          .populate('centers', 'centerName centerCode')
          .populate('stockRequestIds', 'orderNumber challanNo date center')
          .populate('createdBy', 'fullName email');
  
        res.status(200).json({
          success: true,
          message: `${validStockRequests.length} stock request(s) invoiced successfully. Invoice #${invoiceNumber} created.`,
          data: {
            invoice: populatedInvoice,
            stockRequestsUpdated: validStockRequests.length
          }
        });
  
      } catch (error) {
        console.error("Error in invoice creation:", error);
        
        // Handle duplicate invoice number
        if (error.code === 11000 && error.keyPattern?.invoiceNumber) {
          return res.status(400).json({
            success: false,
            message: `Invoice number ${invoiceNumber} already exists. Please use a different invoice number.`
          });
        }
  
        // Handle validation errors
        if (error.name === "ValidationError") {
          const errors = Object.values(error.errors).map(err => err.message);
          return res.status(400).json({
            success: false,
            message: "Invoice validation failed",
            errors: errors
          });
        }
  
        throw error;
      }
  
    } catch (error) {
      console.error("Error marking stock requests as invoiced:", error);
      
      res.status(500).json({
        success: false,
        message: "Error marking stock requests as invoiced",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
      });
    }
  };
  
export const getInvoice = async (req, res) => {
    try {
      const { invoiceId } = req.params;
      
      const invoice = await Invoice.findById(invoiceId)
        .populate('stockRequestIds', 'orderNumber challanNo date')
        .populate('reseller', 'businessName gstNumber address1 address2 city state')
        .populate('centers', 'centerName centerCode')
        .populate('createdBy', 'fullName email')
        .populate('cancellationDetails.cancelledBy', 'fullName email');
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }
  
      res.status(200).json({
        success: true,
        data: invoice
      });
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching invoice",
        error: error.message,
      });
    }
  };
  
// export const getAllInvoices = async (req, res) => {
//     try {
//       const { page = 1, limit = 100, startDate, endDate, resellerId } = req.query;
      
//       const filter = {};
      
//       if (startDate && endDate) {
//         filter.invoiceDate = {
//           $gte: new Date(startDate),
//           $lte: new Date(endDate)
//         };
//       }
      
//       if (resellerId) {
//         filter.reseller = resellerId;
//       }
      
//       const invoices = await Invoice.find(filter)
//         .populate('reseller', 'businessName gstNumber')
//         .populate('centers', 'centerName')
//         .populate('cancellationDetails.cancelledBy', 'fullName email')
//         .sort({ invoiceDate: -1 })
//         .skip((page - 1) * limit)
//         .limit(parseInt(limit));
      
//       const total = await Invoice.countDocuments(filter);
      
//       res.status(200).json({
//         success: true,
//         data: invoices,
//         pagination: {
//           currentPage: parseInt(page),
//           totalPages: Math.ceil(total / limit),
//           totalItems: total
//         }
//       });
//     } catch (error) {
//       console.error("Error fetching invoices:", error);
//       res.status(500).json({
//         success: false,
//         message: "Error fetching invoices",
//         error: error.message,
//       });
//     }
//   };



export const getAllInvoices = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 100, 
      startDate, 
      endDate, 
      resellerId,
      status,
      cancelWithCreditNote,
      invoiceNumber,
      sortBy = 'invoiceDate',
      sortOrder = 'desc'
    } = req.query;
    
    // Build filter object
    const filter = {};
    
    // Date range filter
    if (startDate && endDate) {
      filter.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (startDate) {
      filter.invoiceDate = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.invoiceDate = { $lte: new Date(endDate) };
    }
    
    // Reseller filter
    if (resellerId) {
      filter.reseller = resellerId;
    }
    
    // Invoice number filter (partial match)
    if (invoiceNumber) {
      filter.invoiceNumber = { $regex: invoiceNumber, $options: 'i' };
    }
    
    // Status filter
    if (status) {
      if (status === 'cancelled') {
        filter.status = 'cancelled';
      } else if (status === 'active') {
        // Active means not cancelled
        filter.status = { $ne: 'cancelled' };
      } else if (status) {
        // For specific status values like 'generated', 'sent', 'paid'
        filter.status = status;
      }
    }
    
    // Cancel with credit note filter
    if (cancelWithCreditNote !== undefined && cancelWithCreditNote !== '') {
      // This filter only applies to cancelled invoices
      const cancelWithCreditNoteBool = cancelWithCreditNote === 'true' || cancelWithCreditNote === true;
      
      if (cancelWithCreditNoteBool) {
        // Find invoices that are cancelled AND have cancelWithCreditNote = true
        filter['cancellationDetails.cancelWithCreditNote'] = true;
        // If status filter isn't already set to include cancelled, add it
        if (!filter.status) {
          filter.status = 'cancelled';
        }
      } else {
        // Find invoices that are cancelled AND have cancelWithCreditNote = false
        filter['cancellationDetails.cancelWithCreditNote'] = false;
        // If status filter isn't already set to include cancelled, add it
        if (!filter.status) {
          filter.status = 'cancelled';
        }
      }
    }
    
    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const invoices = await Invoice.find(filter)
      .populate('reseller', 'businessName gstNumber email phone')
      .populate('centers', 'centerName centerCode')
      .populate('stockRequestIds', 'orderNumber challanNo date')
      .populate('createdBy', 'fullName email')
      .populate('cancellationDetails.cancelledBy', 'fullName email')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean(); // Use lean() for better performance
    
    // Get total count for pagination
    const total = await Invoice.countDocuments(filter);
    
    // Get summary statistics
    const summary = await Invoice.aggregate([
      {
        $facet: {
          statusCounts: [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          creditNoteStats: [
            { $match: { status: 'cancelled' } },
            { 
              $group: { 
                _id: "$cancellationDetails.cancelWithCreditNote", 
                count: { $sum: 1 } 
              } 
            }
          ],
          totalAmount: [
            { $group: { _id: null, total: { $sum: "$totalAmount" } } }
          ]
        }
      }
    ]);
    
    const statusCounts = {};
    if (summary[0]?.statusCounts) {
      summary[0].statusCounts.forEach(item => {
        statusCounts[item._id] = item.count;
      });
    }
    
    const creditNoteStats = {
      withCreditNote: 0,
      withoutCreditNote: 0
    };
    if (summary[0]?.creditNoteStats) {
      summary[0].creditNoteStats.forEach(item => {
        if (item._id === true) {
          creditNoteStats.withCreditNote = item.count;
        } else if (item._id === false) {
          creditNoteStats.withoutCreditNote = item.count;
        }
      });
    }
    
    const totalInvoiceAmount = summary[0]?.totalAmount[0]?.total || 0;
    
    res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      filters: {
        applied: {
          startDate: startDate || null,
          endDate: endDate || null,
          resellerId: resellerId || null,
          status: status || null,
          cancelWithCreditNote: cancelWithCreditNote || null,
          invoiceNumber: invoiceNumber || null
        },
        available: {
          statuses: Object.keys(statusCounts),
          creditNoteOptions: ['true', 'false']
        }
      },
      summary: {
        statusCounts,
        creditNoteStats,
        totalInvoiceAmount,
        totalInvoices: total
      }
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching invoices",
      error: error.message,
    });
  }
};


export const cancelInvoice = async (req, res) => {
    try {
      const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
        req,
        ["manage_indent"]
      );
  
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. manage_indent permission required.",
        });
      }
  
      const { invoiceId } = req.params;
      const { 
        cancelReason,
        cancelWithCreditNote 
      } = req.body;
  
      // Validation
      if (!cancelReason || cancelReason.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Cancel reason is required for cancelling invoice",
        });
      }
  
      if (cancelWithCreditNote === undefined || cancelWithCreditNote === null) {
        return res.status(400).json({
          success: false,
          message: "Please specify whether to cancel with credit note",
        });
      }
  
      const userId = req.user?.id;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User authentication required",
        });
      }
  
      // Find the invoice
      const invoice = await Invoice.findById(invoiceId);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }
  
      // Check if invoice is already cancelled
      if (invoice.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          message: "Invoice is already cancelled",
        });
      }
  
      // Check center access permissions for the invoice
      if (!permissions.indent_all_center) {
        // Get all stock requests to check centers
        const stockRequests = await StockRequest.find({
          _id: { $in: invoice.stockRequestIds }
        }).populate('center');
  
        let hasCenterAccess = false;
        for (const request of stockRequests) {
          if (checkCenterAccess(request, userCenter, permissions)) {
            hasCenterAccess = true;
            break;
          }
        }
  
        if (!hasCenterAccess) {
          return res.status(403).json({
            success: false,
            message: "Access denied. You don't have permission to cancel this invoice.",
          });
        }
      }
  
      // Update invoice status to cancelled with cancellation details
      invoice.status = 'cancelled';
      invoice.cancellationDetails = {
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancelReason: cancelReason,
        cancelWithCreditNote: cancelWithCreditNote
      };
      invoice.updatedAt = new Date();
  
      await invoice.save();
  
      // Update all associated stock requests - set invoiceRaised to false
      const stockRequestUpdatePromises = invoice.stockRequestIds.map(stockRequestId =>
        StockRequest.findByIdAndUpdate(
          stockRequestId,
          {
            $set: {
              "invoiceInfo.invoiceRaised": false,
              "invoiceInfo.invoiceCancelled": true,
              "invoiceInfo.invoiceCancelledAt": new Date(),
              "invoiceInfo.invoiceCancelledBy": userId,
              "invoiceInfo.invoiceCancellationReason": cancelReason,
              updatedBy: userId
            }
          },
          { new: true }
        )
      );
  
      await Promise.all(stockRequestUpdatePromises);
  
      const populatedInvoice = await Invoice.findById(invoice._id)
        .populate('reseller', 'businessName gstNumber')
        .populate('centers', 'centerName centerCode')
        .populate('stockRequestIds', 'orderNumber challanNo')
        .populate('createdBy', 'fullName email')
        .populate('cancellationDetails.cancelledBy', 'fullName email');
  
      res.status(200).json({
        success: true,
        message: `Invoice ${invoice.invoiceNumber} cancelled successfully${cancelWithCreditNote ? ' with credit note' : ''}`,
        data: {
          invoice: populatedInvoice,
          creditNoteGenerated: cancelWithCreditNote
        }
      });
  
    } catch (error) {
      console.error("Error cancelling invoice:", error);
      
      res.status(500).json({
        success: false,
        message: "Error cancelling invoice",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
      });
    }
  };