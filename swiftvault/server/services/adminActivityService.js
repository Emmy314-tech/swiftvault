import AdminActivityLog from "../models/AdminActivityLog.js";

// Fire-and-forget style: logging failures should never break the admin action
// itself. Call this after a successful admin action, passing the request object
// so IP/User-Agent can be captured consistently with how LoginHistory does it.
export const logAdminActivity = async ({ admin, action, description, req }) => {
  try {
    await AdminActivityLog.create({
      adminId: admin._id,
      adminName: admin.fullName || admin.username || "Unknown Admin",
      action,
      description,
      ipAddress: req?.ip || "Unknown",
      userAgent: req?.headers?.["user-agent"] || "Unknown",
    });
  } catch (err) {
    console.error("Failed to record admin activity log:", err.message);
  }
};
