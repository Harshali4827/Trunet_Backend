
export const isSuperAdmin = (user) => {
  return user?.role?.roleTitle?.toLowerCase() === "superadmin";
};

export const checkPermission = (user, module, requiredPermission) => {
  if (isSuperAdmin(user)) {
    return true;
  }
  
  const userPermissions = user.role?.permissions || [];
  const modulePermissions = userPermissions.find(
    (perm) => perm.module === module
  );
  
  return modulePermissions?.permissions.includes(requiredPermission) || false;
};