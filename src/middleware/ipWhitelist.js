const allowedIps = (process.env.ALLOWED_IPS || "").split(","); 
export function ipWhitelist(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress;
  if (!allowedIps.includes(clientIp)) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  next();
}