import { useEffect } from 'react';

interface InputParams {
  onJump: () => void;
  onSprintStart: () => void;
  onSprintEnd: () => void;
  onGrenade: () => void;
  onLeftMouseDown: () => void;
  onRightMouseDown: () => void;
  onMouseUp: () => void;
  setMoveState: (updater: (prev: MoveState) => MoveState) => void;
}

export type MoveState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

export function usePlayerInput({
  onJump,
  onSprintStart,
  onSprintEnd,
  onGrenade,
  onLeftMouseDown,
  onRightMouseDown,
  onMouseUp,
  setMoveState,
}: InputParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
          setMoveState(prev => ({ ...prev, forward: true }));
          break;
        case 'KeyS':
          setMoveState(prev => ({ ...prev, backward: true }));
          break;
        case 'KeyA':
          setMoveState(prev => ({ ...prev, left: true }));
          break;
        case 'KeyD':
          setMoveState(prev => ({ ...prev, right: true }));
          break;
        case 'ShiftLeft':
          onSprintStart();
          break;
        case 'Space':
          onJump();
          break;
        case 'KeyG':
          onGrenade();
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
          setMoveState(prev => ({ ...prev, forward: false }));
          break;
        case 'KeyS':
          setMoveState(prev => ({ ...prev, backward: false }));
          break;
        case 'KeyA':
          setMoveState(prev => ({ ...prev, left: false }));
          break;
        case 'KeyD':
          setMoveState(prev => ({ ...prev, right: false }));
          break;
        case 'ShiftLeft':
          onSprintEnd();
          break;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left mouse
        onLeftMouseDown();
      } else if (e.button === 2) {
        // Right mouse
        onRightMouseDown();
      }
    };



    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onMouseUp); // fallback if window loses focus

    // Prevent browser right-click context menu so right mouse works smoothly
    window.addEventListener("contextmenu", (e) => e.preventDefault());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onMouseUp);
    };
  }, [
    onJump,
    onSprintStart,
    onSprintEnd,
    onGrenade,
    onLeftMouseDown,
    onRightMouseDown,
    onMouseUp,
    setMoveState,
  ]);
}
