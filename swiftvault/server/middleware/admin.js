export const adminOnly = (req, res, next) => {
  // Check if the user is authenticated and has the 'admin' role
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: "Access Denied: Admin privileges required." });
  }
};
