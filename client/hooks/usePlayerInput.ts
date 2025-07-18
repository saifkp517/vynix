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

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup',   handleKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup',   onMouseUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup',   handleKeyUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup',   onMouseUp);
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
