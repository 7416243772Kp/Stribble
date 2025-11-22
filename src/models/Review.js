import mongoose from "mongoose";
const ReplySchema = new mongoose.Schema({
    name: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const ReviewSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },
    paymentId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    replies: [ReplySchema],
    createdAt: { type: Date, default: Date.now }
});
ReviewSchema.index({ courseId: 1, paymentId: 1 }, { unique: true });

export default mongoose.model("Review", ReviewSchema);