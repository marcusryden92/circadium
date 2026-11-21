import { useSession } from "@/lib/session/SessionProvider";

export const useCurrentRole = () => {
  const session = useSession();

  return session.data?.user.role;
};
