export type PermissionKey = "dashboard.view" | "items.view" | "items.create" | "items.edit" | "items.delete" | "warehouses.view" | "warehouses.create" | "warehouses.edit" | "vendors.view" | "vendors.create" | "vendors.edit" | "customers.view" | "customers.create" | "customers.edit" | "purchases.view" | "purchases.create" | "purchases.edit" | "receipts.view" | "receipts.create" | "receipts.post" | "inventory.view" | "inventory.adjust" | "inventory.transfer" | "sales.view" | "sales.create" | "sales.edit" | "sales.post" | "invoices.view" | "invoices.create" | "invoices.post" | "payments.view" | "payments.create" | "returns.view" | "returns.create" | "returns.post" | "reports.view" | "users.manage" | "settings.manage";
export type PermissionDefinition = { key: PermissionKey; label: string; description: string };
export type PermissionGroup = { key: string; label: string; description: string; permissions: PermissionDefinition[] };

export const permissionGroups: PermissionGroup[] = [
  { key: "dashboard", label: "Dashboard", description: "See the workspace summary.", permissions: [{ key: "dashboard.view", label: "View dashboard", description: "See stock, sales, and activity summaries." }] },
  { key: "items", label: "Items", description: "Manage the product catalog.", permissions: [{ key: "items.view", label: "View items", description: "See items and their prices." }, { key: "items.create", label: "Add items", description: "Create new products." }, { key: "items.edit", label: "Edit items", description: "Change item details and deactivate items." }, { key: "items.delete", label: "Delete items", description: "Remove items that are not in use." }] },
  { key: "warehouses", label: "Warehouses", description: "Manage stock locations.", permissions: [{ key: "warehouses.view", label: "View warehouses", description: "See warehouse locations." }, { key: "warehouses.create", label: "Add warehouses", description: "Create stock locations." }, { key: "warehouses.edit", label: "Edit warehouses", description: "Change warehouse details." }] },
  { key: "vendors", label: "Vendors", description: "Manage suppliers and purchasing contacts.", permissions: [{ key: "vendors.view", label: "View vendors", description: "See supplier details." }, { key: "vendors.create", label: "Add vendors", description: "Create supplier records." }, { key: "vendors.edit", label: "Edit vendors", description: "Change supplier details." }] },
  { key: "customers", label: "Customers", description: "Manage customers and their sales details.", permissions: [{ key: "customers.view", label: "View customers", description: "See customer details." }, { key: "customers.create", label: "Add customers", description: "Create customer records." }, { key: "customers.edit", label: "Edit customers", description: "Change customer details." }] },
  { key: "purchases", label: "Purchasing", description: "Create and manage purchase orders.", permissions: [{ key: "purchases.view", label: "View purchase orders", description: "See orders sent to vendors." }, { key: "purchases.create", label: "Create purchase orders", description: "Start a new purchase order." }, { key: "purchases.edit", label: "Edit purchase orders", description: "Change draft purchase orders." }] },
  { key: "receipts", label: "Goods receiving", description: "Record stock arriving from vendors.", permissions: [{ key: "receipts.view", label: "View goods receipts", description: "See received stock records." }, { key: "receipts.create", label: "Create goods receipts", description: "Record incoming stock as a draft." }, { key: "receipts.post", label: "Post goods receipts", description: "Confirm received stock and add it to inventory." }] },
  { key: "inventory", label: "Inventory", description: "View and change stock quantities.", permissions: [{ key: "inventory.view", label: "View stock", description: "See stock balances and movement history." }, { key: "inventory.adjust", label: "Adjust stock", description: "Correct stock after a count or discrepancy." }, { key: "inventory.transfer", label: "Transfer stock", description: "Move stock between warehouses." }] },
  { key: "sales", label: "Sales", description: "Manage customer orders and deliveries.", permissions: [{ key: "sales.view", label: "View sales", description: "See sales orders and fulfillments." }, { key: "sales.create", label: "Create sales", description: "Start a customer sale." }, { key: "sales.edit", label: "Edit sales", description: "Change draft sales." }, { key: "sales.post", label: "Post sales", description: "Dispatch a sale and reduce stock." }] },
  { key: "invoices", label: "Invoices", description: "Create and issue customer invoices.", permissions: [{ key: "invoices.view", label: "View invoices", description: "See customer invoices." }, { key: "invoices.create", label: "Create invoices", description: "Create an invoice from a sale." }, { key: "invoices.post", label: "Post invoices", description: "Issue an invoice." }] },
  { key: "payments", label: "Payments", description: "Record and track customer payments.", permissions: [{ key: "payments.view", label: "View payments", description: "See payment history and balances." }, { key: "payments.create", label: "Record payments", description: "Record money received from customers." }] },
  { key: "returns", label: "Returns", description: "Handle returned customer goods.", permissions: [{ key: "returns.view", label: "View returns", description: "See sales returns." }, { key: "returns.create", label: "Create returns", description: "Start a return from an invoice." }, { key: "returns.post", label: "Post returns", description: "Confirm the return and put stock back." }] },
  { key: "reports", label: "Reports", description: "Review business reports.", permissions: [{ key: "reports.view", label: "View reports", description: "See stock, purchase, sales, and customer reports." }] },
  { key: "administration", label: "Administration", description: "Manage access and workspace settings.", permissions: [{ key: "users.manage", label: "Manage users and roles", description: "Assign roles and change access." }, { key: "settings.manage", label: "Manage settings", description: "Change business and invoice settings." }] },
] ;
export type RoleRecord = { id: string; name: string; role_key: string; user_count: number; permission_keys: PermissionKey[] };
export type RoleUser = { id: string; name: string; email: string; role_ids: string[] };
export type InvitationRecord = { id: string; email: string; full_name: string; role_id: string; role_name: string; status: "pending" | "failed"; expires_at: string; last_sent_at: string; created_at: string };
export type RoleManagementData = { roles: RoleRecord[]; permissions: PermissionDefinition[]; users: RoleUser[]; invitations: InvitationRecord[] };

export const roleTemplates = [
  { key: "manager", name: "Manager", description: "Runs daily operations and reviews reports.", permissions: permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.key)).filter((key) => !["users.manage", "settings.manage"].includes(key)) as PermissionKey[] },
  { key: "purchase_staff", name: "Purchase Staff", description: "Creates purchase orders and receives stock.", permissions: ["dashboard.view", "items.view", "warehouses.view", "vendors.view", "vendors.create", "vendors.edit", "purchases.view", "purchases.create", "purchases.edit", "receipts.view", "receipts.create", "receipts.post"] as PermissionKey[] },
  { key: "sales_staff", name: "Sales Staff", description: "Creates sales, invoices, payments, and returns.", permissions: ["dashboard.view", "items.view", "warehouses.view", "customers.view", "customers.create", "customers.edit", "sales.view", "sales.create", "sales.edit", "sales.post", "invoices.view", "invoices.create", "invoices.post", "payments.view", "payments.create", "returns.view", "returns.create", "returns.post"] as PermissionKey[] },
  { key: "inventory_staff", name: "Inventory Staff", description: "Maintains items, warehouses, and stock.", permissions: ["dashboard.view", "items.view", "items.create", "items.edit", "warehouses.view", "warehouses.create", "warehouses.edit", "purchases.view", "receipts.view", "receipts.create", "receipts.post", "inventory.view", "inventory.adjust", "inventory.transfer"] as PermissionKey[] },
  { key: "viewer", name: "Viewer", description: "Can view workspace information without changing it.", permissions: permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.key)).filter((key) => key.endsWith(".view")) as PermissionKey[] },
] as const;

const permissionKeySet = new Set<string>(permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.key)));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function items(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown) {
  return items(value).filter((entry): entry is string => typeof entry === "string");
}

export function parseRoleManagementData(value: unknown): RoleManagementData {
  const source = record(value);
  const permissions = items(source.permissions).flatMap((entry) => {
    const item = record(entry);
    return typeof item.key === "string" && permissionKeySet.has(item.key) && typeof item.description === "string" ? [{ key: item.key as PermissionKey, label: permissionGroups.flatMap((group) => group.permissions).find((permission) => permission.key === item.key)?.label ?? item.key, description: item.description }] : [];
  });
  const roles = items(source.roles).flatMap((entry) => {
    const item = record(entry);
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "";
    const roleKey = typeof item.role_key === "string" ? item.role_key : "";
    if (!uuidPattern.test(id) || !name || !roleKey) return [];
    return [{ id, name, role_key: roleKey, user_count: typeof item.user_count === "number" && Number.isSafeInteger(item.user_count) && item.user_count >= 0 ? item.user_count : 0, permission_keys: strings(item.permission_keys).filter((key): key is PermissionKey => permissionKeySet.has(key)) }];
  });
  const users = items(source.users).flatMap((entry) => {
    const item = record(entry);
    const id = typeof item.id === "string" ? item.id : "";
    if (!uuidPattern.test(id)) return [];
    return [{ id, name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Workspace user", email: typeof item.email === "string" ? item.email : "", role_ids: strings(item.role_ids).filter((roleId) => uuidPattern.test(roleId)) }];
  });
  const invitations = items(source.invitations).flatMap((entry) => {
    const item = record(entry);
    const id = typeof item.id === "string" ? item.id : "";
    const roleId = typeof item.role_id === "string" ? item.role_id : "";
    const status = item.status === "failed" ? "failed" : item.status === "pending" ? "pending" : "";
    if (!uuidPattern.test(id) || !uuidPattern.test(roleId) || !status || typeof item.email !== "string" || typeof item.full_name !== "string" || typeof item.role_name !== "string") return [];
    return [{ id, email: item.email, full_name: item.full_name, role_id: roleId, role_name: item.role_name, status: status as "pending" | "failed", expires_at: typeof item.expires_at === "string" ? item.expires_at : "", last_sent_at: typeof item.last_sent_at === "string" ? item.last_sent_at : "", created_at: typeof item.created_at === "string" ? item.created_at : "" }];
  });
  return { roles, permissions, users, invitations };
}

export function permissionDefinition(key: string) {
  return permissionGroups.flatMap((group) => group.permissions).find((permission) => permission.key === key);
}
