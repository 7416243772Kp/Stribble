import mongoose from "mongoose";

const UnsubscribeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  unsubscribedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Unsubscribe", UnsubscribeSchema);
