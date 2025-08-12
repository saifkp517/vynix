import React, { useEffect, useRef, RefObject } from 'react';
import { Vector3, Mesh, AudioListener, PositionalAudio } from 'three';
import { EventEmitter } from 'events';
import { Opponent } from './Opponent';

interface PlayerData {
    position: Vector3;
    velocity: Vector3;
    cameraDirection: Vector3;
}

interface BotPersonality {
    aggressiveness: number;
    mobility: number;
    accuracy: number;
    cautiousness: number;
}

interface Props {
    botId: string;
    playerDataRef: RefObject<Record<string, PlayerData>>;
    shootEvent: EventEmitter;
    addObstacleRef: (ref: Mesh | null) => void;
    getGroundHeight: (x: number, z: number) => number;
    smoothnessRef: RefObject<number>;
    listener?: AudioListener;
    onDeath: () => void;
}

// Map bounds configuration
const MAP_SIZE = 500;
const MAP_BOUNDS = {
    minX: -MAP_SIZE / 2,
    maxX: MAP_SIZE / 2,
    minZ: -MAP_SIZE / 2,
    maxZ: MAP_SIZE / 2,
};

const BotOpponent: React.FC<Props> = ({
    botId,
    playerDataRef,
    shootEvent,
    addObstacleRef,
    getGroundHeight,
    smoothnessRef,
    listener,
    onDeath,
}) => {
    // Separate intervals for AI decisions vs movement updates
    const aiIntervalRef = useRef<NodeJS.Timeout>(null);
    const movementIntervalRef = useRef<NodeJS.Timeout>(null);
    const walkingAudioRef = useRef<PositionalAudio>(null);
    const personalityRef = useRef<BotPersonality>(null);
    const lastActionTimeRef = useRef<number>(0);
    const currentGoalRef = useRef<Vector3 | null>(null);
    const isWalkingRef = useRef<boolean>(false);
    const lastUpdateTimeRef = useRef<number>(Date.now());
    
    // Movement state - this persists between AI decisions
    const movementStateRef = useRef({
        isMoving: false,
        targetDirection: new Vector3(0, 0, 0),
        currentSpeed: 0,
        shouldMove: false,
    });

    // Generate unique personality for this bot
    useEffect(() => {
        personalityRef.current = {
            aggressiveness: 0,
            mobility: 0,
            accuracy: Math.random(),
            cautiousness:0,
        };
    }, []);

    // AI Decision Making Loop (slower, for decisions only)
    useEffect(() => {
        const startAI = () => {
            // AI makes decisions every 300-1000ms
            const aiUpdateInterval = 300 + Math.random() * 700;
            
            aiIntervalRef.current = setInterval(() => {
                makeAIDecision();
            }, aiUpdateInterval);
        };

        // Movement Update Loop (fast, for smooth movement)
        const startMovement = () => {
            // Movement updates at ~60fps (16ms) for smooth movement
            movementIntervalRef.current = setInterval(() => {
                updateMovement();
            }, 16);
        };

        // Start both loops with random delays
        const aiDelay = Math.random() * 100;
        const movementDelay = Math.random() * 16;
        
        const aiTimeout = setTimeout(startAI, aiDelay);
        const movementTimeout = setTimeout(startMovement, movementDelay);

        return () => {
            if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
            if (movementIntervalRef.current) clearInterval(movementIntervalRef.current);
            clearTimeout(aiTimeout);
            clearTimeout(movementTimeout);
        };
    }, []);

    const makeAIDecision = () => {
        const personality = personalityRef.current;
        const botData = playerDataRef.current[botId];
        
        if (!personality || !botData) return;

        const now = Date.now();
        const timeSinceLastAction = now - lastActionTimeRef.current;

        // AI Decision: Should the bot move?
        const shouldMove = Math.random() < personality.mobility * 0.8;
        const shouldShoot = Math.random() < personality.aggressiveness * 0.15;
        const shouldChangeDirection = Math.random() < (1 - personality.cautiousness) * 0.4;

        // Update movement goal/direction
        if (shouldMove || shouldChangeDirection || !currentGoalRef.current) {
            handleMovementDecision(personality, botData);
        } else {
            // Sometimes stop moving
            if (Math.random() < 0.1) {
                movementStateRef.current.shouldMove = false;
            }
        }

        // Shooting AI
        if (shouldShoot && timeSinceLastAction > 1000) {
            handleShootingAI(personality, botData);
            lastActionTimeRef.current = now;
        }
    };

    const handleMovementDecision = (personality: BotPersonality, botData: PlayerData) => {
        // Generate new goal if needed
        const distanceToGoal = currentGoalRef.current ? 
            botData.position.distanceTo(currentGoalRef.current) : 999;
            
        if (!currentGoalRef.current || distanceToGoal < 5) {
            currentGoalRef.current = generatePatrolGoal(botData.position, personality);
        }

        // Set movement direction and speed (like pressing 'W')
        if (currentGoalRef.current) {
            const direction = currentGoalRef.current.clone().sub(botData.position);
            direction.y = 0;
            
            if (direction.length() > 1) {
                direction.normalize();
                movementStateRef.current.targetDirection = direction;
                movementStateRef.current.currentSpeed = personality.mobility * 15 + 5;
                movementStateRef.current.shouldMove = true;
            }
        }
    };

    // This runs at 60fps for smooth movement (like game engine update loop)
    const updateMovement = () => {
        const botData = playerDataRef.current[botId];
        if (!botData || !movementStateRef.current.shouldMove) {
            isWalkingRef.current = false;
            updateWalkingAudio();
            return;
        }

        // Calculate delta time
        const now = Date.now();
        const deltaTime = Math.min((now - lastUpdateTimeRef.current) / 1000, 0.033); // Cap at ~30fps
        lastUpdateTimeRef.current = now;

        // Apply continuous movement (like holding 'W')
        const currentVelocity = movementStateRef.current.targetDirection
            .clone()
            .multiplyScalar(movementStateRef.current.currentSpeed);

        const movementDelta = currentVelocity.clone().multiplyScalar(deltaTime);
        const newPosition = botData.position.clone().add(movementDelta);
        
        // Ensure we stay within map bounds
        newPosition.x = Math.max(MAP_BOUNDS.minX, Math.min(MAP_BOUNDS.maxX, newPosition.x));
        newPosition.z = Math.max(MAP_BOUNDS.minZ, Math.min(MAP_BOUNDS.maxZ, newPosition.z));
        newPosition.y = getGroundHeight(newPosition.x, newPosition.z) + 2.5;

        // Update camera direction to face movement direction
        const newCameraDirection = movementStateRef.current.targetDirection.clone();
        newCameraDirection.normalize();

        // Update bot data
        playerDataRef.current[botId] = {
            position: newPosition,
            velocity: currentVelocity,
            cameraDirection: newCameraDirection,
        };

        isWalkingRef.current = true;
        updateWalkingAudio();

        // Stop if we've reached our goal
        if (currentGoalRef.current && 
            botData.position.distanceTo(currentGoalRef.current) < 3) {
            movementStateRef.current.shouldMove = false;
        }
    };

    const generatePatrolGoal = (currentPosition: Vector3, personality: BotPersonality): Vector3 => {
        let goalX: number, goalZ: number;
        
        if (personality.cautiousness > 0.7) {
            const patrolRadius = 50;
            goalX = currentPosition.x + (Math.random() * 2 - 1) * patrolRadius;
            goalZ = currentPosition.z + (Math.random() * 2 - 1) * patrolRadius;
        } else {
            const patrolRadius = personality.aggressiveness * 200 + 50;
            goalX = currentPosition.x + (Math.random() * 2 - 1) * patrolRadius;
            goalZ = currentPosition.z + (Math.random() * 2 - 1) * patrolRadius;
        }

        goalX = Math.max(MAP_BOUNDS.minX + 10, Math.min(MAP_BOUNDS.maxX - 10, goalX));
        goalZ = Math.max(MAP_BOUNDS.minZ + 10, Math.min(MAP_BOUNDS.maxZ - 10, goalZ));
        
        const goalY = getGroundHeight(goalX, goalZ);
        return new Vector3(goalX, goalY, goalZ);
    };

    const handleShootingAI = (personality: BotPersonality, botData: PlayerData) => {
        const baseDirection = botData.cameraDirection.clone();
        const inaccuracy = (1 - personality.accuracy) * 0.5;
        
        baseDirection.x += (Math.random() - 0.5) * inaccuracy;
        baseDirection.z += (Math.random() - 0.5) * inaccuracy;
        baseDirection.normalize();

        shootEvent.emit('playerShot', {
            id: botId,
            rayOrigin: botData.position.clone(),
            rayDirection: baseDirection,
        });
    };

    const updateWalkingAudio = () => {
        const audio = walkingAudioRef.current;
        if (!audio) return;

        if (isWalkingRef.current && !audio.isPlaying) {
            audio.setDistanceModel('linear');
            audio.setRefDistance(5);
            audio.setMaxDistance(15);
            audio.setLoop(true);
            audio.setVolume(0.5);
            audio.play();
        } else if (!isWalkingRef.current && audio.isPlaying) {
            audio.stop();
        }
    };

    const getBotData = () => playerDataRef.current[botId] || null;

    return (
        <Opponent
            positionRef={() => getBotData()?.position || null}
            velocityRef={() => getBotData()?.velocity || null}
            cameraDirectionRef={() => getBotData()?.cameraDirection || null}
            shootEvent={shootEvent}
            userId={botId}
            isRemote={true}
            addObstacleRef={addObstacleRef}
            getGroundHeight={getGroundHeight}
            smoothnessRef={smoothnessRef}
            listener={listener}
            setAudioRef={(userId, audio) => {
                walkingAudioRef.current = audio;
            }}
        />
    );
};

export default BotOpponent;
