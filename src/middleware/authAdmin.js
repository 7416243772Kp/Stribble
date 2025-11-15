import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "super-long-random-string-change-me";

export default function authAdmin(req, res, next) {
const cookieToken = req.cookies?.adminToken;
const bearer = req.headers.authorization?.split(" ")[1];
const token = cookieToken || bearer;

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