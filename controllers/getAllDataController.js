import Building from '../models/Building.js';
import Customer from "../models/Customer.js";
import Center from "../models/Center.js";

export const getAllData = async (req, res) => {
  try {

    const [buildings, customers, centers] = await Promise.all([
      Building.find()
        .select('buildingName _id center')
        .populate('center', 'centerName centerCode _id')
        .lean(),

      Customer.find()
        .select('username name _id center')
        .populate('center', 'centerName centerCode _id')
        .lean(),
      
      Center.find()
        .select('centerName centerCode _id')
        .lean()
    ]);

    const transformedData = {
      buildings: buildings.map(building => ({
        id: building._id,
        name: building.buildingName,
        center: building.center ? {
          id: building.center._id,
          name: building.center.centerName
        } : null
      })),
      
      customers: customers.map(customer => ({
        id: customer._id,
        name: customer.name,
        username: customer.username,
        center: customer.center ? {
          id: customer.center._id,
          name: customer.center.centerName
        } : null
      })),
      
      centers: centers.map(center => ({
        id: center._id,
        name: center.centerName,
        code: center.centerCode
      }))
    };

    return res.status(200).json({
      success: true,
      data: transformedData,
      counts: {
        buildings: transformedData.buildings.length,
        customers: transformedData.customers.length,
        centers: transformedData.centers.length
      }
    });

  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch data",
      error: error.message
    });
  }
};