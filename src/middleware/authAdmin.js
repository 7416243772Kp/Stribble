import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "d5ed15b4956e460f84c7ff2ff41d3abbefa83526f215476ebfd19a678f235fa2";

export default function authAdmin(req, res, next) {
  // Accept admin session only from the HttpOnly cookie
  const token = req.cookies?.adminToken;

  if (!token) {
    console.log("[authAdmin] No token. origin:", req.headers.origin, "ip:", req.ip);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    return next();
  } catch (err) {
    console.log("[authAdmin] JWT verify failed:", err?.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

export { authAdmin };