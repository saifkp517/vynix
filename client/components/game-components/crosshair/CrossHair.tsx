import React, {
  useImperativeHandle,
  forwardRef,
  useCallback,
  useRef,
  useState,
} from "react";

interface CrosshairRef {
  triggerHit: (damage?: number) => void;
}

export const Crosshair = React.memo(
  forwardRef<CrosshairRef, {}>((_, ref) => {
    const animationRef = useRef<HTMLDivElement>(null);
    const [damageTexts, setDamageTexts] = useState<
      { id: number; value: number; x: number; y: number }[]
    >([]);
    const [diagonalKeys, setDiagonalKeys] = useState<number[]>([]);

    // Spawn floating text near the crosshair
    const spawnDamageText = (damage: number) => {
      const id = Date.now() + Math.random();
      const angle = Math.random() * Math.PI * 2;
      const radius = 20; // distance from center in px

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      setDamageTexts((prev) => [...prev, { id, value: damage, x, y }]);

      // Remove after animation finishes
      setTimeout(() => {
        setDamageTexts((prev) => prev.filter((t) => t.id !== id));
      }, 800); // match CSS animation
    };

    const triggerHit = useCallback((damage: number = 10) => {
      console.log("crosshair hit");

      // Trigger crosshair animation
      if (animationRef.current) {
        animationRef.current.classList.remove("hit-animation");
        void animationRef.current.offsetWidth; // reflow
        animationRef.current.classList.add("hit-animation");
      }

      // Trigger diagonal animations in random order
      const randomKey = Date.now();
      setDiagonalKeys((prev) => [...prev, randomKey]);
      setTimeout(() => {
        setDiagonalKeys((prev) => prev.filter((k) => k !== randomKey));
      }, 300); // match diagonal animation length

      // Spawn floating number
      spawnDamageText(damage);
    }, []);

    useImperativeHandle(ref, () => ({
      triggerHit,
    }));

    return (
      <>
        <style>
          {`
            .crosshair-container {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              z-index: 1000;
              pointer-events: none;
            }

            .crosshair-line {
              position: absolute;
              background-color: #ffffff;
              box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
            }

            .horizontal-line {
              width: 20px;
              height: 2px;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            }

            .vertical-line {
              width: 2px;
              height: 20px;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            }

            .center-dot {
              width: 2px;
              height: 2px;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              background-color: #ffffff;
              box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
              position: absolute;
            }

            /* Floating damage numbers */
            .damage-text {
              position: absolute;
              top: 50%;
              left: 50%;
              color: #ff4444;
              font-weight: bold;
              font-size: 16px;
              text-shadow: 0 0 6px black;
              opacity: 0;
              transform: translate(-50%, -50%) scale(1);
              animation: floatUp 0.8s ease-out forwards;
            }

            @keyframes floatUp {
              0% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
              }
              50% {
                opacity: 1;
                transform: translate(-50%, -80%) scale(1.2);
              }
              100% {
                opacity: 0;
                transform: translate(-50%, -120%) scale(0.8);
              }
            }

            /* Diagonal hit indicators */
            .diagonal-line {
              position: absolute;
              width: 2px;
              height: 15px;
              background-color: #00ff00;
              opacity: 0;
              box-shadow: 0 0 8px #00ff00;
              top: 50%;
              left: 50%;
              transform-origin: bottom center;
            }

            .diagonal-anim {
              animation: diagonal-expand 0.25s ease-out forwards;
            }

            @keyframes diagonal-expand {
              0% {
                opacity: 1;
                transform: translate(-50%, -50%) rotate(var(--rotation)) scale(0.5);
              }
              50% {
                opacity: 1;
                transform: translate(-50%, -50%) rotate(var(--rotation)) scale(1) translateY(-10px);
              }
              100% {
                opacity: 0;
                transform: translate(-50%, -50%) rotate(var(--rotation)) scale(1.2) translateY(-20px);
              }
            }
          `}
        </style>

        <div className="crosshair-container" ref={animationRef}>
          {/* Main crosshair */}
          <div className="crosshair-line horizontal-line"></div>
          <div className="crosshair-line vertical-line"></div>
          <div className="center-dot"></div>

          {/* Floating numbers */}
          {damageTexts.map((t) => (
            <div
              key={t.id}
              className="damage-text"
              style={{
                transform: `translate(calc(-50% + ${t.x}px), calc(-50% + ${t.y}px))`,
              }}
            >
              {t.value}
            </div>
          ))}

          {/* Diagonal hit indicators (random order on each trigger) */}
          {diagonalKeys.map((k) => {
            // Pick a random rotation for each hit
            const rotations = [-45, 45, 135, 225];
            return rotations.map((rot, i) => (
              <div
                key={`${k}-${i}`}
                className="diagonal-line diagonal-anim"
                style={{ ["--rotation" as any]: `${rot}deg` }}
              />
            ));
          })}
        </div>
      </>
    );
  })
);
