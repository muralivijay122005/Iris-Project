import { redirect } from "next/navigation";

// Legacy /chat/:id links open the chat in the main app
export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/?chatId=${encodeURIComponent(id)}`);
}
