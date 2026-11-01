import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AuthSession from "../models/AuthSession.js";

// PROTECT MIDDLEWARE
export const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      if (
        !decoded.sessionId ||
        !Number.isInteger(decoded.authTokenVersion) ||
        decoded.authTokenVersion !== (req.user.authTokenVersion || 0)
      ) {
        return res.status(401).json({ message: "Session is invalid or has expired" });
      }

      const session = await AuthSession.findOne({
        tokenId: decoded.sessionId,
        userId: req.user._id,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (!session) {
        return res.status(401).json({ message: "Session is invalid or has expired" });
      }
      if (session._id && (!session.lastUsedAt || Date.now() - session.lastUsedAt.getTime() >= 5 * 60 * 1000)) {
        const lastUsedAt = new Date();
        await AuthSession.updateOne(
          { _id: session._id, revokedAt: null },
          { $set: { lastUsedAt } }
        );
        session.lastUsedAt = lastUsedAt;
      }
      req.authSession = session;

      if (req.user.isSuspended) {
        return res.status(403).json({ message: "Your account has been suspended. Please contact support." });
      }

      return next();
    }

    return res.status(401).json({ message: "Not authorized, no token" });

  } catch (error) {
    return res.status(401).json({ message: "Token failed" });
  }
};

// ADMIN MIDDLEWARE
export const admin = (req, res, next) => {
  try {
    if (req.user && req.user.role === "admin") {
      return next();
    }

    return res.status(403).json({ message: "Admins only" });

  } catch (err) {
    return res.status(500).json({ message: "Middleware error" });
  }
};

// OPTIONAL AUTH MIDDLEWARE
// Attaches req.user when a valid token is present, but never rejects the
// request. Used on public read-only endpoints (e.g. VTU plan listings) so
// logged-in users see their own tier's pricing instead of always the default
// normal-tier price.
export const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer")) {
      const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
      if (!decoded.sessionId || !Number.isInteger(decoded.authTokenVersion)) return next();

      const user = await User.findById(decoded.id).select("tier isUpgraded authTokenVersion");
      if (!user || decoded.authTokenVersion !== (user.authTokenVersion || 0)) return next();

      const session = await AuthSession.findOne({
        tokenId: decoded.sessionId,
        userId: user._id,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (session) req.user = user;
    }
  } catch {
    // Invalid/expired token on a public endpoint is not an error - proceed unauthenticated.
  }
  next();
};
