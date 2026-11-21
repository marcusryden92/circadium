import { useSession } from "@/lib/session/SessionProvider";

export const useCurrentUser = () => {
  const session = useSession();

  return session.data?.user;
};
