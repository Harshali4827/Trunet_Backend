// import Building from '../models/Building.js';
// import Customer from "../models/Customer.js";
// import Center from "../models/Center.js";

// export const getAllData = async (req, res) => {
//   try {

//     const [buildings, customers, centers] = await Promise.all([
//       Building.find()
//         .select('buildingName _id center')
//         .populate('center', 'centerName centerCode _id')
//         .lean(),

//       Customer.find()
//         .select('username name _id center')
//         .populate('center', 'centerName centerCode _id')
//         .lean(),
      
//       Center.find()
//         .select('centerName centerCode _id')
//         .lean()
//     ]);

//     const transformedData = {
//       buildings: buildings.map(building => ({
//         id: building._id,
//         name: building.buildingName,
//         center: building.center ? {
//           id: building.center._id,
//           name: building.center.centerName
//         } : null
//       })),
      
//       customers: customers.map(customer => ({
//         id: customer._id,
//         name: customer.name,
//         username: customer.username,
//         center: customer.center ? {
//           id: customer.center._id,
//           name: customer.center.centerName
//         } : null
//       })),
      
//       centers: centers.map(center => ({
//         id: center._id,
//         name: center.centerName,
//         code: center.centerCode
//       }))
//     };

//     return res.status(200).json({
//       success: true,
//       data: transformedData,
//       counts: {
//         buildings: transformedData.buildings.length,
//         customers: transformedData.customers.length,
//         centers: transformedData.centers.length
//       }
//     });

//   } catch (error) {
//     console.error("Error fetching data:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch data",
//       error: error.message
//     });
//   }
// };




import Building from '../models/Building.js';
import Customer from "../models/Customer.js";
import Center from "../models/Center.js";

export const getAllData = async (req, res) => {
  try {
  
    const userPermissions = req.user.role?.permissions || [];
  
    const customerModule = userPermissions.find(
      (perm) => perm.module === "Customer"
    );
    const centerModule = userPermissions.find(
      (perm) => perm.module === "Center"
    );
    const settingsModule = userPermissions.find(
      (perm) => perm.module === "Settings"
    );

    const canViewAllCustomers = customerModule && 
      customerModule.permissions.includes("view_customer_all_center");
    const canViewOwnCustomers = customerModule && 
      customerModule.permissions.includes("view_customer_own_center");
    
    const canViewAllCenters = centerModule && 
      centerModule.permissions.includes("view_all_center");
    const canViewOwnCenters = centerModule && 
      centerModule.permissions.includes("view_own_center");
    
    const canViewAllBuildings = settingsModule && 
      settingsModule.permissions.includes("view_building_all_center");
    const canViewOwnBuildings = settingsModule && 
      settingsModule.permissions.includes("view_building_own_center");

    // Check if user has at least one permission for each module they're trying to access
    const hasCustomerPermission = canViewAllCustomers || canViewOwnCustomers;
    const hasCenterPermission = canViewAllCenters || canViewOwnCenters;
    const hasBuildingPermission = canViewAllBuildings || canViewOwnBuildings;

    // Initialize filter objects
    const buildingFilter = {};
    const customerFilter = {};
    const centerFilter = {};

    // Get user's center ID if available
    const userCenterId = req.user.center?._id || req.user.center;

    // Apply filters based on permissions
    // For Buildings
    if (hasBuildingPermission) {
      if (canViewOwnBuildings && !canViewAllBuildings && userCenterId) {
        buildingFilter.center = userCenterId;
      }
      // If can view all, no filter needed (show all)
    }

    // For Customers
    if (hasCustomerPermission) {
      if (canViewOwnCustomers && !canViewAllCustomers && userCenterId) {
        customerFilter.center = userCenterId;
      }
      // If can view all, no filter needed (show all)
    }

    // For Centers
    if (hasCenterPermission) {
      if (canViewOwnCenters && !canViewAllCenters && userCenterId) {
        centerFilter._id = userCenterId;
      }
      // If can view all, no filter needed (show all)
    }

    // Fetch data with appropriate filters
    const [buildings, customers, centers] = await Promise.all([
      // Only fetch buildings if user has permission
      hasBuildingPermission ? 
        Building.find(buildingFilter)
          .select('buildingName _id center')
          .populate('center', 'centerName centerCode _id')
          .lean() : Promise.resolve([]),

      // Only fetch customers if user has permission
      hasCustomerPermission ? 
        Customer.find(customerFilter)
          .select('username name _id center')
          .populate('center', 'centerName centerCode _id')
          .lean() : Promise.resolve([]),
      
      // Only fetch centers if user has permission
      hasCenterPermission ? 
        Center.find(centerFilter)
          .select('centerName centerCode _id')
          .lean() : Promise.resolve([])
    ]);

    // Transform data
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

    // Check if user has any data access at all
    const hasAnyData = hasBuildingPermission || hasCustomerPermission || hasCenterPermission;
    
    if (!hasAnyData) {
      return res.status(403).json({
        success: false,
        message: "Access denied. No permissions to view any data.",
        data: {
          buildings: [],
          customers: [],
          centers: []
        },
        counts: {
          buildings: 0,
          customers: 0,
          centers: 0
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: transformedData,
      counts: {
        buildings: transformedData.buildings.length,
        customers: transformedData.customers.length,
        centers: transformedData.centers.length
      },
      permissions: {
        buildings: hasBuildingPermission,
        customers: hasCustomerPermission,
        centers: hasCenterPermission,
        viewAll: {
          buildings: canViewAllBuildings,
          customers: canViewAllCustomers,
          centers: canViewAllCenters
        },
        viewOwn: {
          buildings: canViewOwnBuildings,
          customers: canViewOwnCustomers,
          centers: canViewOwnCenters
        }
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