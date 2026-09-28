//login/route.ts
import { connectToDatabase } from "../../../../lib/mongodb";
import User from "../../../../models/user";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: NextRequest) {
  await connectToDatabase();
  const { username, password } = await req.json();

  const user = await User.findOne({
    $or: [{ username }, { email: username }],
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = jwt.sign(
    { _id: user._id, username: user.username },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  (await cookies()).set("token", token, { httpOnly: true, secure: true });

  return NextResponse.json({ message: "Logged in" });
}
