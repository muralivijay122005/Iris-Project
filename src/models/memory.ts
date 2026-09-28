// models/memory.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMemory extends Document {
  user: mongoose.Types.ObjectId;
  content: string;
  source: "auto" | "manual";
  chat?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const memorySchema = new Schema<IMemory>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    content: { type: String, required: true, maxlength: 500 },
    source: { type: String, enum: ["auto", "manual"], default: "manual" },
    chat: { type: Schema.Types.ObjectId, ref: "Chat" },
  },
  { timestamps: true }
);

const Memory: Model<IMemory> =
  mongoose.models.Memory || mongoose.model<IMemory>("Memory", memorySchema);

export default Memory;
