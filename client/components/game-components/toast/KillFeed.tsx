import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";

export function KillFeedRenderer({
  subscribe,
}: {
  subscribe: (cb: (data: { id: number; name: string; streak: number }[]) => void) => void;
}) {
  const [feed, setFeed] = useState<{ id: number; name: string; streak: number }[]>([]);

  useEffect(() => {
    subscribe(setFeed);
  }, [subscribe]);

  // Sound effect player
  const playSound = (frequency: number, duration: number, type: OscillatorType = "sine") => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
      // Silently fail if audio context is not available
    }
  };

  const playKillSound = (streak: number) => {
    if (streak === 1) {
      playSound(400, 0.1, "square");
      setTimeout(() => playSound(600, 0.15, "square"), 50);
    } else if (streak === 2) {
      playSound(500, 0.1, "sawtooth");
      setTimeout(() => playSound(700, 0.1, "sawtooth"), 80);
      setTimeout(() => playSound(900, 0.15, "sawtooth"), 160);
    } else if (streak === 3) {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => playSound(600 + i * 100, 0.08, "square"), i * 50);
      }
    } else if (streak >= 4) {
      // Epic sound
      playSound(200, 0.3, "sawtooth");
      setTimeout(() => playSound(400, 0.3, "sawtooth"), 100);
      setTimeout(() => playSound(800, 0.4, "square"), 200);
    }
  };

  const messages = useMemo(() => {
    const idToMsg: { [key: number]: { text: string; streak: number; gradient: string } } = {};

    for (const { id, name, streak } of feed) {
      let msg: string;
      let gradient: string;

      switch (streak) {
        case 1:
          msg = `💥 First Kill, you killed ${name}`;
          gradient = "from-green-500 to-emerald-500";
          break;
        case 2:
          msg = `😂 Double Kill, ${name} went down. Greedy much?`;
          gradient = "from-orange-500 to-yellow-500";
          break;
        case 3:
          msg = `🔥 Triple Kill, ${name} is toast. You're on fire!`;
          gradient = "from-yellow-500 to-red-600";
          break;
        case 4:
          msg = `💀 Quad Kill, ${name} joins the pile. Death dealer deluxe.`;
          gradient = "from-purple-500 to-pink-500";
          break;
        case 5:
          msg = `🌟 Penta Kill, ${name} never stood a chance!`;
          gradient = "from-blue-500 to-purple-600";
          break;
        default:
          msg = `👑 ${streak} Kill Streak, ${name} is just another notch.`;
          gradient = "from-yellow-400 via-pink-500 to-purple-600";
      }

      idToMsg[id] = { text: msg, streak, gradient };
    }

    return idToMsg;
  }, [feed]);

  useEffect(() => {
    if (feed.length > 0) {
      const latestKill = feed[0];
      const msgData = messages[latestKill.id];
      if (msgData) {
        playKillSound(msgData.streak);
      }
    }
  }, [feed]);

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 space-y-3 pointer-events-none">
      <AnimatePresence>
        {feed.map((item) => {
          const msgData = messages[item.id] || {
            text: `💥 ${item.name} strikes again!`,
            streak: 1,
            gradient: "from-red-500 to-orange-500",
          };

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -80, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className={`bg-gradient-to-r ${msgData.gradient} text-white px-8 py-4 rounded-2xl font-black text-2xl border-4 border-white/30 shadow-2xl`}
              style={{ willChange: "transform, opacity" }}
            >
              {msgData.text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
