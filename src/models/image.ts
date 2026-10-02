// models/image.ts
// Generated images, stored separately from chats so chat documents stay small
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IImage extends Document {
  user: mongoose.Types.ObjectId;
  chat?: mongoose.Types.ObjectId;
  data: Buffer;
  mime: string;
  prompt: string;
  width: number;
  height: number;
  provider: string;
  createdAt: Date;
}

const imageSchema = new Schema<IImage>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    chat: { type: Schema.Types.ObjectId, ref: "Chat", index: true },
    data: { type: Buffer, required: true },
    mime: { type: String, default: "image/jpeg" },
    prompt: { type: String, default: "" },
    width: { type: Number, default: 1024 },
    height: { type: Number, default: 1024 },
    provider: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

if (process.env.NODE_ENV === "development" && mongoose.models.GeneratedImage) {
  mongoose.deleteModel("GeneratedImage");
}

const GeneratedImage: Model<IImage> =
  mongoose.models.GeneratedImage || mongoose.model<IImage>("GeneratedImage", imageSchema);

export default GeneratedImage;
