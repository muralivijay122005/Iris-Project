import { connectToDatabase } from "../../../../lib/mongodb";
import User from "../../../../models/user";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  await connectToDatabase();
  const { username, email, password } = await req.json();

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing)
    return NextResponse.json({ error: "User exists" }, { status: 400 });

  const hashed = await bcrypt.hash(password, 10);
  await User.create({ username, email, password: hashed });

  return NextResponse.json({ message: "User registered" }, { status: 201 });
}
