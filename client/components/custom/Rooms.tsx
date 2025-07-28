import React, { useState, useEffect } from 'react';
import { Trees, Crown, Badge } from 'lucide-react';
import axios from 'axios';

export const RoomsUI = () => {

    const API_URL = process.env.BACKEND_URL;

    useEffect(() => {
        const fetchRooms = async () => {
            try {
                const rooms = await axios.get(`${API_URL}/game/rooms`);
                console.log(rooms.data.rooms)
            } catch(err) {
                console.log(err);
            }
        };
        fetchRooms();
    }, [])

    const [rooms, setRooms] = useState([
        { id: 1, name: 'Arena Battle #1', players: '4/8', status: 'Active' },
        { id: 2, name: 'Forest Duel', players: '1/8', status: 'Waiting' },
        { id: 3, name: 'Desert Storm', players: '6/8', status: 'Active' },
        { id: 4, name: 'Ice Cavern', players: '2/8', status: 'Waiting' },
        { id: 5, name: 'Volcano Peak', players: '8/8', status: 'Full' },
        
    ]);

    const addRoom = () => {
        const newRoom = {
            id: Date.now(),
            name: `Battle Arena ${rooms.length + 1}`,
            players: '0/8',
            status: 'Waiting',
        };
        setRooms([...rooms, newRoom]);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-5xl font-bold mb-2 text-primary">
                    <Trees className="inline-block mr-2 h-8 w-8" /> Zentra
                </h1>
                <h2 className="text-2xl font-semibold">Epic Combat Arena</h2>
                <div className="flex justify-center gap-2 mt-3">
                    <Badge
                        className="px-3 py-1 cursor-pointer hover:bg-muted transition"
                        onClick={addRoom}
                    >
                        <Crown className="h-4 w-4 mr-1" /> Create Room
                    </Badge>
                </div>
            </div>

            {/* Rooms List with Overflow */}
            <div className="space-y-3">                
                {/* Scrollable container with max height */}
                <div className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-500">
                    <div className="space-y-2 pr-2">
                        {rooms.map(room => (
                            <div key={room.id} className="bg-muted/30 backdrop-blur-sm rounded-lg p-3 border border-gray-700">
                                <div className="flex justify-between items-center">
                                    <div className="items-centerF">
                                        <span className="font-semibold text-foreground">{room.name}</span>
                                        
                                        
                                        <div className="flex items-center gap-1">
                                            <div className={`w-2 h-2 rounded-full ${
                                                room.status === 'Active' 
                                                    ? 'bg-green-500 animate-pulse' 
                                                    : room.status === 'Full'
                                                    ? 'bg-red-500'
                                                    : 'bg-yellow-500'
                                            }`}>
                                                {room.status === 'Active' && (
                                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-ping absolute"></div>
                                                )}
                                            </div>
                                            <span className={`text-xs font-medium ${
                                                room.status === 'Active' 
                                                    ? 'text-green-500' 
                                                    : room.status === 'Full'
                                                    ? 'text-red-500'
                                                    : 'text-yellow-500'
                                            }`}>
                                                {room.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Players: {room.players}</span>
                                    <button 
                                        className={`border px-4 py-2 rounded-lg text-sm transition-colors ${
                                            room.status === 'Full' 
                                                ? 'border-red-300 text-red-400 cursor-not-allowed opacity-50' 
                                                : 'border-gray-foreground text-muted-foreground hover:bg-muted cursor-pointer'
                                        }`}
                                        disabled={room.status === 'Full'}
                                    >
                                        {room.status === 'Full' ? 'Room Full' : 'Join Room'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {rooms.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-4">
                        No rooms available. Create one to get started!
                    </div>
                )}
            </div>
        </div>
    );
};

