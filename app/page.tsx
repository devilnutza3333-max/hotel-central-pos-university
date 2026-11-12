import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";
import PosApp from "./pos-app";

export default async function Home() {
  const user = await requireChatGPTUser("/");

  return (
    <PosApp
      signedInUser={{
        id: user.userId,
        name: user.displayName,
        email: user.email,
        signOutUrl: chatGPTSignOutPath(),
      }}
    />
  );
}
