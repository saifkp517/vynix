import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface JoinLeaveEvent {
  id: string;
  message: string;
  type: "join" | "leave";
}

interface PlayerJoinLeaveFeedProps {
  events: JoinLeaveEvent[];
}

const PlayerJoinLeaveFeed: React.FC<PlayerJoinLeaveFeedProps> = ({ events }) => {
  const [visibleEvents, setVisibleEvents] = useState<JoinLeaveEvent[]>([]);

  // Sync from parent but remove after 2s
  useEffect(() => {
    if (events.length === 0) return;

    const latest = events[0];
    setVisibleEvents((prev) => [latest, ...prev]);

    const timer = setTimeout(() => {
      setVisibleEvents((prev) => prev.filter((e) => e.id !== latest.id));
    }, 2000);

    return () => clearTimeout(timer);
  }, [events]);

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 space-y-1 pointer-events-none">
      <AnimatePresence>
        {visibleEvents.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={`px-3 py-1 rounded text-xs font-medium text-center
              ${
                item.type === "join"
                  ? "bg-green-500/10 text-green-200"
                  : "bg-red-500/10 text-red-200"
              } backdrop-blur-sm`}
          >
            {item.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default PlayerJoinLeaveFeed;
