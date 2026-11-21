import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { UserRole } from "../../contracts";

// The authenticated-session user shape. Mirrors web's types/user.ts (same
// fields, same UserRole union the contracts prove equal to the Prisma enum), so
// a web dispatch of its own User is assignable to this payload and back.
export type User = {
  name?: string | null;
  id?: string;
  email?: string | null;
  image?: string | null;
  role?: UserRole;
  isTwoFactorEnabled?: boolean;
};

type UserState = {
  user: User | null;
};

const initialState: UserState = {
  user: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
  },
});

export default userSlice.reducer;
export const { setUser } = userSlice.actions;
