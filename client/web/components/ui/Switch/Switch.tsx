"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { root, thumb } from "./Switch.css";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitives.Root
      ref={ref}
      className={className ? `${root} ${className}` : root}
      {...props}
    >
      <SwitchPrimitives.Thumb className={thumb} />
    </SwitchPrimitives.Root>
  );
});

Switch.displayName = SwitchPrimitives.Root.displayName;
