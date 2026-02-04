import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";

export function KillFeedRenderer({
  subscribe,
}: {
  subscribe: (cb: (data: { id: number; name: string }[]) => void) => void;
}) {
  const [feed, setFeed] = useState<{ id: number; name: string }[]>([]);
  const [particles, setParticles] = useState<{ id: string; x: number; y: number; emoji: string }[]>([]);

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

  const spawnParticles = (streak: number) => {
    const emojis = ["💥", "⚡", "✨", "🔥", "💫", "⭐", "💀", "👑"];
    const count = Math.min(streak * 3, 20);
    
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      x: Math.random() * window.innerWidth,
      y: Math.random() * 300,
      emoji: emojis[Math.floor(Math.random() * emojis.length)]
    }));
    
    setParticles(prev => [...prev, ...newParticles]);
    
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
    }, 2000);
  };

  const messages = useMemo(() => {
    const chrono = [...feed].reverse();
    const idToMsg: { [key: number]: { text: string; streak: number; gradient: string } } = {};

    let currentPlayer: string | null = null;
    let streak = 0;

    for (const { id, name } of chrono) {
      if (name === currentPlayer) {
        streak++;
      } else {
        currentPlayer = name;
        streak = 1;
      }

      let msg: string;
      let gradient: string;

      switch (streak) {
        case 1:
          msg = `💥 First Kill, you killed ${name}`;
          gradient = "from-green-500 to-emerald-500";
          break;
        case 2:
          msg = `😂 ${name} Double Kill! Greedy much?`;
          gradient = "from-orange-500 to-y  ellow-500";
          break;
        case 3:
          msg = `🔥 ${name} Triple Kill! You're on fire, literally!`;
          gradient = "from-yellow-500 to-red-600";
          break;
        case 4:
          msg = `💀 ${name} Quad Kill! Death dealer deluxe.`;
          gradient = "from-purple-500 to-pink-500";
          break;
        case 5:
          msg = `🌟 ${name} Penta Kill! God-tier slaying!`;
          gradient = "from-blue-500 to-purple-600";
          break;
        default:
          msg = `👑 ${name} ${streak} Kill Streak! Bow before the beast!`;
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
        spawnParticles(msgData.streak);
      }
    }
  }, [feed]);

  return (
    <>
      {/* Particle explosion layer */}
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{ 
              x: window.innerWidth / 2, 
              y: 100,
              scale: 0,
              opacity: 1 
            }}
            animate={{ 
              x: particle.x,
              y: particle.y,
              scale: 2,
              opacity: 0,
              rotate: 360
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ 
              duration: 1.5,
              ease: "easeOut"
            }}
            className="fixed text-4xl pointer-events-none z-40"
            style={{ left: 0, top: 0 }}
          >
            {particle.emoji}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Kill feed messages */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 space-y-3 pointer-events-none">
        <AnimatePresence>
          {feed.map((item) => {
            const msgData = messages[item.id] || { 
              text: `💥 ${item.name} strikes again!`, 
              streak: 1,
              gradient: "from-red-500 to-orange-500"
            };
            
            return (
              <motion.div
                key={item.id}
                initial={{ 
                  opacity: 0, 
                  y: -80, 
                  scale: 0.5,
                  rotateX: -90
                }}
                animate={{ 
                  opacity: 1, 
                  y: 0, 
                  scale: 1.2,
                  rotateX: 0
                }}
                exit={{ 
                  opacity: 0, 
                  y: -30, 
                  scale: 0.8,
                  filter: "blur(10px)"
                }}
                transition={{ 
                  duration: 0.6,
                  type: "spring",
                  stiffness: 200,
                  damping: 15
                }}
                className="relative"
              >
                {/* Glow effect */}
                <motion.div
                  animate={{
                    scale: 1.1,
                    opacity: 0.8
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut"
                  }}
                  className={`absolute inset-0 bg-gradient-to-r ${msgData.gradient} blur-xl rounded-2xl`}
                />
                
                {/* Main message */}
                <motion.div
                  animate={{
                    boxShadow: "0 0 40px rgba(255,255,255,0.6)"
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut"
                  }}
                  className={`relative bg-gradient-to-r ${msgData.gradient} text-white px-8 py-4 rounded-2xl backdrop-blur-md font-black text-2xl border-4 border-white/30 shadow-2xl`}
                >
                  <motion.span
                    animate={{
                      scale: 1.05
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      repeatType: "reverse",
                      ease: "easeInOut"
                    }}
                  >
                    {msgData.text}
                  </motion.span>
                  
                  {/* Streak indicator */}
                  {msgData.streak >= 3 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ 
                        scale: 1.5,
                        rotate: 360
                      }}
                      transition={{ duration: 0.5 }}
                      className="absolute -top-3 -right-3 bg-yellow-400 text-black rounded-full w-12 h-12 flex items-center justify-center text-xl font-black border-4 border-white shadow-lg"
                    >
                      {msgData.streak}x
                    </motion.div>
                  )}
                </motion.div>

                {/* Sparkle effects */}
                {msgData.streak >= 3 && (
                  <>
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, opacity: 1 }}
                        animate={{
                          scale: 1,
                          opacity: 0,
                          x: (i % 2 ? 1 : -1) * (30 + i * 10),
                          y: -30 - i * 5
                        }}
                        transition={{
                          duration: 1,
                          delay: i * 0.1,
                          ease: "easeOut"
                        }}
                        className="absolute top-1/2 left-1/2 text-yellow-300 text-2xl"
                      >
                        ✨
                      </motion.div>
                    ))}
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Screen shake effect on high streaks */}
      <AnimatePresence>
        {feed.length > 0 && messages[feed[0].id]?.streak >= 4 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-white z-30 pointer-events-none"
          />
        )}
      </AnimatePresence>
    </>
  );
}