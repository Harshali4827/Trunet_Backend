
import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  invoiceDate: {
    type: Date,
    required: true
  },
  stockRequestIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockRequest',
    required: true
  }],
  reseller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reseller',
    required: true
  },
  centers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Center'
  }],
  products: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    productTitle: String,
    hsnCode: String,
    quantity: Number,
    outletQty: Number,
    damageRepairQty: Number,
    centerReturnQty: Number,
    outletRate: Number,
    repairRate: Number,
    centerReturnRate: Number,
    outletAmount: Number,
    damageRepairAmount: Number,
    centerReturnAmount: Number,
    totalAmount: Number,
    unit: String
  }],
  totalOutletAmount: Number,
  totalDamageRepairAmount: Number,
  totalCenterReturnAmount: Number,
  totalBeforeTax: Number,
  cgst: Number,
  sgst: Number,
  roundOff: Number,
  totalAmount: Number,
  metadata: {
    deliveryNote: String,
    modeOfPayment: String,
    referenceNo: String,
    referenceDate: Date,
    otherReferences: String,
    buyerOrderNo: String,
    buyerOrderDate: Date,
    dispatchDocNo: String,
    deliveryNoteDate: Date,
    dispatchedThrough: String,
    destination: String,
    termsOfDelivery: String
  },
  hsnSummary: [{
    hsnCode: String,
    taxableValue: Number,
    cgstAmount: Number,
    sgstAmount: Number,
    totalTax: Number
  }],
  invoiceHtml: String,
  invoicePdfPath: String,
  status: {
    type: String,
    enum: ['generated', 'sent', 'paid', 'cancelled'],
    default: 'generated'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

export default mongoose.model('Invoice', invoiceSchema);