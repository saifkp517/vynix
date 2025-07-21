import { useEffect } from 'react';

interface InputParams {
  onJump: () => void;
  onSprintStart: () => void;
  onSprintEnd: () => void;
  onGrenade: () => void;
  onMouseDown: () => void;
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
  onMouseDown,
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

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onMouseUp); // fallback if window loses focus

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onMouseUp);
    };
  }, [
    onJump,
    onSprintStart,
    onSprintEnd,
    onGrenade,
    onMouseDown,
    onMouseUp,
    setMoveState,
  ]);
}
