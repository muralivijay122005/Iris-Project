// models/user.ts
import mongoose, { Schema } from "mongoose";

const PreferencesSchema = new Schema(
  {
    // "What should Iris know about you?"
    aboutYou: { type: String, default: "", maxlength: 1500 },
    // "How should Iris respond?"
    responseStyle: { type: String, default: "", maxlength: 1500 },
    // Include saved memories in the system prompt
    memoryEnabled: { type: Boolean, default: true },
    // Let Iris save new memories automatically from conversations
    memoryAutoSave: { type: Boolean, default: true },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    preferences: { type: PreferencesSchema, default: () => ({}) },
  },
  { timestamps: true }
);

UserSchema.index({ username: 1, email: 1 });

// Re-register in dev so schema edits apply after hot reload
if (process.env.NODE_ENV === "development" && mongoose.models.User) {
  mongoose.deleteModel("User");
}

export default mongoose.models.User || mongoose.model("User", UserSchema);
