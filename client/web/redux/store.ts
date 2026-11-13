// The Redux store now lives in @circadium/shared/state as a makeStore() factory.
// StoreProvider owns the single instance per mount (injecting web's engine-input
// adapters); everything else imports the RootState / AppDispatch types from here.
export { makeStore } from "@circadium/shared/state/store";
export type {
  RootState,
  AppDispatch,
  AppStore,
  StateDependencies,
} from "@circadium/shared/state/store";
