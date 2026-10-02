// models/chat.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAttachment {
  name: string;
  size: number;
  type: string;
  // Extracted text sent to the model; empty for files that can't be read as text
  content?: string;
  truncated?: boolean;
}

export interface IImageRef {
  id: string;
  prompt: string;
  width: number;
  height: number;
}

export interface IMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: IAttachment[];
  // Images generated for an assistant reply (bytes live in GeneratedImage)
  images?: IImageRef[];
  reasoning?: string;
  model?: string;
  interrupted?: boolean;
  createdAt?: Date;
  // Legacy single-file fields (pre-redesign messages)
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileData?: Buffer;
  fileContent?: string;
}

export interface IChat extends Document {
  title: string;
  messages: IMessage[];
  user: mongoose.Types.ObjectId;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IAttachment>(
  {
    name: { type: String, required: true },
    size: { type: Number, default: 0 },
    type: { type: String, default: "" },
    content: { type: String, default: "" },
    truncated: { type: Boolean, default: false },
  },
  { _id: false }
);

const imageRefSchema = new Schema<IImageRef>(
  {
    id: { type: String, required: true },
    prompt: { type: String, default: "" },
    width: { type: Number, default: 1024 },
    height: { type: Number, default: 1024 },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>({
  role: { type: String, enum: ["user", "assistant"], required: true },
  // Not required: an interrupted reply can be empty
  content: { type: String, default: "" },
  attachments: { type: [attachmentSchema], default: undefined },
  images: { type: [imageRefSchema], default: undefined },
  reasoning: { type: String },
  model: { type: String },
  interrupted: { type: Boolean },
  createdAt: { type: Date, default: Date.now },
  fileName: { type: String },
  fileSize: { type: Number },
  fileType: { type: String },
  fileData: { type: Buffer },
  fileContent: { type: String },
});

const chatSchema = new Schema<IChat>(
  {
    title: { type: String, required: true },
    messages: [messageSchema],
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

chatSchema.index({ user: 1, _id: 1 });
chatSchema.index({ user: 1, pinned: -1, updatedAt: -1 });

// Re-register in dev so schema edits apply after hot reload
if (process.env.NODE_ENV === "development" && mongoose.models.Chat) {
  mongoose.deleteModel("Chat");
}

const Chat: Model<IChat> =
  mongoose.models.Chat || mongoose.model<IChat>("Chat", chatSchema);

export default Chat;

// Normalizes a stored message (including legacy single-file ones) for the client
export function serializeMessage(msg: any, includeFileContent = false) {
  const attachments: IAttachment[] =
    msg.attachments && msg.attachments.length
      ? msg.attachments
      : msg.fileName
      ? [
          {
            name: msg.fileName,
            size: msg.fileSize || 0,
            type: msg.fileType || "",
            content: msg.fileContent || "",
          },
        ]
      : [];

  return {
    role: msg.role,
    content: msg.content || "",
    reasoning: msg.reasoning || undefined,
    model: msg.model || undefined,
    interrupted: msg.interrupted || undefined,
    createdAt: msg.createdAt,
    images: msg.images?.length ? msg.images : undefined,
    attachments: attachments.map((a) => ({
      name: a.name,
      size: a.size,
      type: a.type,
      readable: !!a.content,
      ...(includeFileContent && { content: a.content }),
    })),
  };
}
