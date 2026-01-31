
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
        .populate('createdBy', 'fullName email');
      
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
  
export const getAllInvoices = async (req, res) => {
    try {
      const { page = 1, limit = 10, startDate, endDate, resellerId } = req.query;
      
      const filter = {};
      
      if (startDate && endDate) {
        filter.invoiceDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
      
      if (resellerId) {
        filter.reseller = resellerId;
      }
      
      const invoices = await Invoice.find(filter)
        .populate('reseller', 'businessName')
        .populate('centers', 'centerName')
        .sort({ invoiceDate: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
      
      const total = await Invoice.countDocuments(filter);
      
      res.status(200).json({
        success: true,
        data: invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total
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