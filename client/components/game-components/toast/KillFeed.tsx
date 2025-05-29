import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";

export function KillFeedRenderer({
  subscribe,
}: {
  subscribe: (cb: (data: { id: number; name: string }[]) => void) => void;
}) {
  const [feed, setFeed] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    subscribe(setFeed);
  }, [subscribe]);

  return (
    <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 space-y-2">
      <AnimatePresence>
        {feed.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.5 }}
            className="bg-black/70 text-white px-6 py-3 rounded-xl shadow-xl backdrop-blur-md font-bold text-xl"
          >
            💥 You killed {item.name}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
