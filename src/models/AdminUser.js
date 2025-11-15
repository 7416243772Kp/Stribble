// src/models/AdminUser.js
import mongoose from "mongoose";

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  totpSecret: { type: String, default: "" },
  totpEnabled: { type: Boolean, default: false },
  refreshTokens: [
    {
      tokenHash: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

// Export the model (not just the schema)
const AdminUser = mongoose.models.AdminUser || mongoose.model("AdminUser", AdminUserSchema);
export default AdminUser;
