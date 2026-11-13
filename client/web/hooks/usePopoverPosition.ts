import { useState, useEffect, useRef } from "react";

type Position = {
  top: number;
  left: number;
};

type Direction = "left" | "right";

interface PopoverDimensions {
  width: number;
  height: number;
}

interface UsePopoverPositionOptions {
  eventRect: DOMRect;
  dimensions: PopoverDimensions;
  padding?: number;
}

const usePopoverPosition = ({
  eventRect,
  dimensions,
  padding = 16,
}: UsePopoverPositionOptions) => {
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  // Find the optimal horizontal direction (left or right)
  const findOptimalHorizontalDirection = (): Direction => {
    const viewportWidth = window.innerWidth;

    // Calculate available space on each side
    const spaceLeft = eventRect.left - padding;
    const spaceRight = viewportWidth - eventRect.right - padding;

    // Return the direction with more space
    return spaceLeft > spaceRight ? "left" : "right";
  };

  // Calculate optimal position based on viewport and event position
  const calculateOptimalPosition = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Prioritize left or right placement depending on available space
    const horizontalDirection = findOptimalHorizontalDirection();

    let top = 0;
    let left = 0;

    // Default vertical position - centered with the event
    top = eventRect.top + eventRect.height / 2 - dimensions.height / 2;

    // Set horizontal position based on the chosen direction
    if (horizontalDirection === "left") {
      left = eventRect.left - dimensions.width - 8; // 8px gap
    } else {
      // right
      left = eventRect.right + 8; // 8px gap
    }

    // Adjust vertical position if needed to keep within viewport
    if (top < padding) {
      top = padding; // Adjust if too close to top
    } else if (top + dimensions.height > viewportHeight - padding) {
      top = viewportHeight - dimensions.height - padding; // Adjust if too close to bottom
    }

    // Final safety check to ensure within viewport horizontally
    if (left < padding) {
      left = padding;
    } else if (left + dimensions.width > viewportWidth - padding) {
      left = viewportWidth - dimensions.width - padding;
    }

    setPosition({ top, left });
    setIsPositioned(true);
  };

  // Start dragging from the supplied mouse event. Caller controls which
  // element triggers this (e.g. a dedicated grip handle), so no target-selector
  // filtering is done here.
  const startDrag = (e: React.MouseEvent) => {
    setIsDragging(true);
    if (popoverRef.current) {
      const rect = popoverRef.current.getBoundingClientRect();
      setDragOffset({
        top: e.clientY - rect.top,
        left: e.clientX - rect.left,
      });
    }
    e.preventDefault();
  };

  // Calculate optimal position before first render to avoid flickering
  useEffect(() => {
    if (!isPositioned) {
      calculateOptimalPosition();
    }
  }, []);

  // Handle dragging functionality
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      setPosition({
        top: event.clientY - dragOffset.top,
        left: event.clientX - dragOffset.left,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return {
    position,
    isPositioned,
    isDragging,
    popoverRef,
    startDrag,
  };
};

export default usePopoverPosition;
