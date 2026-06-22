import mongoose from 'mongoose';
import crypto from 'crypto';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function hashSessionToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token))
    .digest('hex');
}

export function hashDeviceId(deviceId) {
  return crypto
    .createHash('sha256')
    .update(`device:${String(deviceId)}`)
    .digest('hex');
}

export function isDeviceLockMatch(user, deviceId) {
  const storedDeviceId = user?.deviceLock?.deviceId;
  if (!storedDeviceId) return true;
  if (!deviceId) return false;

  return storedDeviceId === hashDeviceId(deviceId) || storedDeviceId === deviceId;
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Optional (if using Google only)
  googleId: { type: String },
  name: { type: String },
  // 🔒 SECURITY FIELDS
  purchasedCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  reviewedCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  activeSessionToken: { type: String }, // Stores the ONLY valid login token
  deviceLock: {
    deviceId: { type: String, default: null },
    deviceName: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
  },
}, { timestamps: true });

userSchema.pre('save', function (next) {
  if (
    this.isModified('activeSessionToken') &&
    this.activeSessionToken &&
    !SHA256_HEX_PATTERN.test(this.activeSessionToken)
  ) {
    this.activeSessionToken = hashSessionToken(this.activeSessionToken);
  }

  next();
});

userSchema.statics.hashSessionToken = hashSessionToken;
userSchema.statics.hashDeviceId = hashDeviceId;
userSchema.statics.isDeviceLockMatch = isDeviceLockMatch;

export default mongoose.model('User', userSchema);
