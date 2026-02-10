
export const isSuperAdmin = (user) => {
  return user?.role?.roleTitle?.toLowerCase() === "superadmin";
};

export const checkPermission = (user, module, action) => {
  if (isSuperAdmin(user)) {
    return true;
  }

  const userPermissions = user?.role?.permissions || [];
  const modulePermissions = userPermissions.find(
    (perm) => perm.module.toLowerCase() === module.toLowerCase()
  );

  return modulePermissions && modulePermissions.permissions.includes(action);
};