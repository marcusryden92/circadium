import { createSlice, nanoid, PayloadAction } from "@reduxjs/toolkit";

export type Toast = {
  id: string;
  text: string;
};

// Newest renders at the bottom of the stack; ToastStack owns expiry timers.
const MAX_TOASTS = 5;

const toastSlice = createSlice({
  name: "toasts",
  initialState: { items: [] as Toast[] },
  reducers: {
    pushToast: {
      reducer: (state, action: PayloadAction<Toast>) => {
        state.items.push(action.payload);
        if (state.items.length > MAX_TOASTS) state.items.shift();
      },
      prepare: (text: string) => ({ payload: { id: nanoid(), text } }),
    },
    removeToast: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((t) => t.id !== action.payload);
    },
  },
});

export const { pushToast, removeToast } = toastSlice.actions;
export default toastSlice;
