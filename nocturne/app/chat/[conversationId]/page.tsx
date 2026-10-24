import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { getProvider } from "@/lib/ai";
import { getContext } from "@/lib/data";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: PageProps<"/chat/[conversationId]">) {
  const { conversationId } = await params;
  const { store, viewer } = await getContext();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/chat/${conversationId}`)}`);
  if (!uuidSchema.safeParse(conversationId).success) notFound();

  const conversation = await store.getConversation(viewer.id, conversationId);
  if (!conversation) notFound();
  const [character, messages] = await Promise.all([
    store.getCharacter(viewer.id, conversation.characterId),
    store.listMessages(viewer.id, conversation.id),
  ]);

  const problem = getProvider().configurationProblem();
  return (
    <ChatView
      key={conversation.id}
      conversation={{
        id: conversation.id,
        title: conversation.title,
        pinned: conversation.pinned,
        memory: conversation.memory?.summary ?? null,
      }}
      character={character ? { id: character.id, name: character.name, avatarUrl: character.avatarUrl } : null}
      initialMessages={messages}
      providerProblem={problem ? `${problem} See the README section "Configure the AI provider".` : null}
    />
  );
}
